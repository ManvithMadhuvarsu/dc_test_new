import { v4 as uuid } from 'uuid';
import { config } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { shuffle } from '../utils/shuffle.js';
import { logAuditEvent } from '../utils/auditLogger.js';

const SESSION_STATUS = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  TERMINATED: 'TERMINATED',
};

function unauthorized(message) {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function ensureExamPassword(examPassword) {
  if (!examPassword) {
    throw unauthorized('Exam Password Required. Please enter the exam password to proceed.');
  }
  if (examPassword !== config.examPassword) {
    throw unauthorized('Incorrect Exam Password. The password you entered is incorrect. Please check and try again.');
  }
}

export async function createSecureSession(payload) {
  const {
    name,
    degree,
    course,
    studentId,
    examPassword,
  } = payload;

  ensureExamPassword(examPassword);

  if (!studentId) {
    throw badRequest('College ID Required. Please enter your College ID to proceed.');
  }

  return withTransaction(async (connection) => {
    try {
      const [studentRows] = await connection.query(
        `SELECT student_identifier, full_name, degree, course, has_attempted
         FROM students
         WHERE student_identifier = $1
           AND is_active = TRUE
         FOR UPDATE`,
        [studentId.trim()],
      );

      if (!studentRows || studentRows.length === 0) {
        throw unauthorized('Incorrect College ID. The provided College ID is not registered in the system. Please verify your College ID and try again.');
      }

      const student = studentRows[0];

      // Ensure the provided name matches the roster name for this College ID
      const providedName = (name || '').trim().toLowerCase();
      const rosterName = (student.full_name || '').trim().toLowerCase();
      if (!providedName || providedName !== rosterName) {
        throw unauthorized('Name and College ID do not match our records. Please enter the exact name registered for this College ID.');
      }

      if (student.has_attempted) {
        throw unauthorized('College ID Already Used. This College ID has already been used to attempt the exam. Each student can only attempt the exam once.');
      }

      const [questions] = await connection.query(
        `SELECT id, prompt, option_a, option_b, option_c, option_d
         FROM questions
         WHERE is_active = TRUE`,
      );

    if (!questions.length) {
      throw new Error('Question Bank Empty. No questions are available in the system. Please contact support.');
    }

    const randomizedQuestions = shuffle(questions).map((question, index) => ({
      ...question,
      sequence: index + 1,
    }));

    const sessionId = uuid();
    const expiresAt = new Date(Date.now() + (config.examDurationMinutes * 60 * 1000));

    await connection.query(
      `INSERT INTO sessions
        (session_id, student_name, degree, course, student_identifier, status, started_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [
        sessionId,
        name?.trim() || student.full_name,
        degree?.trim() || student.degree || '',
        course?.trim() || student.course || '',
        student.student_identifier,
        SESSION_STATUS.ACTIVE,
        expiresAt,
      ],
    );

    await connection.query(
      'UPDATE students SET has_attempted = TRUE WHERE student_identifier = $1',
      [student.student_identifier],
    );

    await logAuditEvent(sessionId, student.student_identifier, 'CONNECTED');

    const placeholders = randomizedQuestions
      .map((_, index) => {
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(', ');
    const values = randomizedQuestions.flatMap((question) => [
      sessionId,
      question.id,
      question.sequence,
    ]);

    await connection.query(
      `INSERT INTO session_questions (session_id, question_id, sequence)
       VALUES ${placeholders}`,
      values,
    );

      return {
        sessionId,
        questionCount: randomizedQuestions.length,
        expiresAt: expiresAt.toISOString(),
        durationMinutes: config.examDurationMinutes,
        studentName: name?.trim() || student.full_name,
        degree: degree?.trim() || student.degree || '',
        course: course?.trim() || student.course || '',
        studentId: student.student_identifier,
      };
    } catch (error) {
      console.error('[createSecureSession] Error:', error.message);
      console.error('[createSecureSession] Stack:', error.stack);
      throw error;
    }
  });
}

export async function markTestStarted(sessionId) {
  const [sessions] = await pool.query(
    'SELECT student_identifier FROM sessions WHERE session_id = $1',
    [sessionId],
  );

  if (sessions.length) {
    await logAuditEvent(sessionId, sessions[0].student_identifier, 'STARTED_TEST');
  }
}

export async function getSessionQuestions(sessionId) {
  const [sessions] = await pool.query(
    'SELECT status, expires_at, student_identifier FROM sessions WHERE session_id = $1',
    [sessionId],
  );

  if (!sessions.length) {
    throw notFound('Session Not Found. The exam session could not be found. Please log in again.');
  }

  const session = sessions[0];

  if (session.status !== SESSION_STATUS.ACTIVE) {
    throw badRequest('Session Not Active. This exam session is no longer active. Please contact support.');
  }

  if (session.expires_at && new Date(session.expires_at) <= new Date()) {
    await logViolation(sessionId, 'Session expired');
    throw badRequest('Session Expired. Your exam session has expired. Please contact support.');
  }

  await markTestStarted(sessionId);

  const [questions] = await pool.query(
    `SELECT
        q.id,
        q.prompt,
        q.option_a AS "optionA",
        q.option_b AS "optionB",
        q.option_c AS "optionC",
        q.option_d AS "optionD",
        sq.sequence
     FROM session_questions sq
     INNER JOIN questions q ON q.id = sq.question_id
     WHERE sq.session_id = $1
     ORDER BY sq.sequence ASC`,
    [sessionId],
  );

  return questions;
}

export async function submitExam(sessionId, answers) {
  if (!Array.isArray(answers) || !answers.length) {
    throw badRequest('No Answers Provided. Please provide answers to submit the exam.');
  }

  return withTransaction(async (connection) => {
    const [[session]] = await connection.query(
      'SELECT status, expires_at FROM sessions WHERE session_id = $1 FOR UPDATE',
      [sessionId],
    );

    if (!session) {
      throw notFound('Session Not Found. The exam session could not be found. Please log in again.');
    }

    if (session.status !== SESSION_STATUS.ACTIVE) {
      throw badRequest('Session Already Closed. This exam session has already been closed. Please contact support.');
    }

    if (session.expires_at && new Date(session.expires_at) <= new Date()) {
      await connection.query(
        `INSERT INTO violations
          (session_id, reason, recorded_at)
         VALUES ($1, $2, NOW())`,
        [sessionId, 'Session expired'],
      );
      await connection.query(
        `UPDATE sessions
           SET status = $1, violation_reason = $2, ended_at = NOW()
         WHERE session_id = $3`,
        [SESSION_STATUS.TERMINATED, 'Session expired', sessionId],
      );
      throw badRequest('Session Time Elapsed. Your exam time has expired. The session has been closed.');
    }

    const [sessionQuestions] = await connection.query(
      'SELECT question_id FROM session_questions WHERE session_id = $1',
      [sessionId],
    );

    const validQuestionIds = new Set(sessionQuestions.map((row) => row.question_id));

    const sanitizedAnswers = answers
      .filter((answer) => validQuestionIds.has(answer.questionId))
      .map((answer) => ({
        questionId: Number(answer.questionId),
        selectedOption: answer.selectedOption?.toUpperCase() || null,
      }));

    if (!sanitizedAnswers.length) {
      throw badRequest('No Valid Answers. No valid answers were submitted. Please provide answers to the questions.');
    }

    const deduped = new Map();
    sanitizedAnswers.forEach((answer) => {
      deduped.set(answer.questionId, answer.selectedOption);
    });

    const uniqueAnswers = [...deduped.entries()].map(([questionId, selectedOption]) => ({
      questionId,
      selectedOption,
    }));

    const ids = uniqueAnswers.map((answer) => answer.questionId);

    const [questionRows] = await connection.query(
      `SELECT id, correct_option AS "correctOption"
       FROM questions
       WHERE id = ANY($1::int[])`,
      [ids],
    );

    const correctMap = new Map(questionRows.map((row) => [row.id, row.correctOption]));

    let score = 0;
    const responseTuples = uniqueAnswers.map((answer) => {
      const correctOption = correctMap.get(answer.questionId);
      const isCorrect = correctOption && correctOption === answer.selectedOption;
      if (isCorrect) {
        score += 1;
      }
      return [
        sessionId,
        answer.questionId,
        answer.selectedOption,
        Boolean(isCorrect),
      ];
    });

    await connection.query(
      'DELETE FROM responses WHERE session_id = $1',
      [sessionId],
    );

    const responsePlaceholders = responseTuples
      .map((_, index) => {
        const base = index * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      })
      .join(', ');
    const responseValues = responseTuples.flat();

    await connection.query(
      `INSERT INTO responses
        (session_id, question_id, selected_option, is_correct)
       VALUES ${responsePlaceholders}`,
      responseValues,
    );

    const [[sessionInfo]] = await connection.query(
      'SELECT student_identifier FROM sessions WHERE session_id = $1',
      [sessionId],
    );

    await connection.query(
      `UPDATE sessions
         SET status = $1, score = $2, ended_at = NOW()
       WHERE session_id = $3`,
      [SESSION_STATUS.COMPLETED, score, sessionId],
    );

    if (sessionInfo) {
      await logAuditEvent(sessionId, sessionInfo.student_identifier, 'SUBMITTED', score);
    }

    return {
      score,
      totalQuestions: validQuestionIds.size,
    };
  });
}

export async function logViolation(sessionId, reason) {
  if (!reason) {
    throw badRequest('Violation Reason Required. A violation reason must be provided.');
  }

  return withTransaction(async (connection) => {
    const [[session]] = await connection.query(
      'SELECT status FROM sessions WHERE session_id = $1 FOR UPDATE',
      [sessionId],
    );

    if (!session) {
      throw notFound('Session Not Found. The exam session could not be found. Please log in again.');
    }

    await connection.query(
      `INSERT INTO violations
        (session_id, reason, recorded_at)
       VALUES ($1, $2, NOW())`,
      [sessionId, reason],
    );

    if (session.status !== SESSION_STATUS.TERMINATED) {
      await connection.query(
        `UPDATE sessions
           SET status = $1, violation_reason = $2, ended_at = NOW()
         WHERE session_id = $3`,
        [SESSION_STATUS.TERMINATED, reason, sessionId],
      );

      const [[sessionInfo]] = await connection.query(
        'SELECT student_identifier, score FROM sessions WHERE session_id = $1',
        [sessionId],
      );

      if (sessionInfo) {
        await logAuditEvent(sessionId, sessionInfo.student_identifier, 'KICKED_OUT', sessionInfo.score, reason);
      }
    }

    return { status: SESSION_STATUS.TERMINATED };
  });
}

export async function getSessionStatus(sessionId) {
  const [rows] = await pool.query(
    `SELECT
        session_id AS "sessionId",
        student_name AS "studentName",
        status,
        score,
        started_at AS "startedAt",
        expires_at AS "expiresAt",
        ended_at AS "endedAt",
        violation_reason AS "violationReason"
     FROM sessions
     WHERE session_id = $1`,
    [sessionId],
  );

  if (!rows.length) {
    throw notFound('Session Not Found. The exam session could not be found. Please log in again.');
  }

  return rows[0];
}

export { SESSION_STATUS };

