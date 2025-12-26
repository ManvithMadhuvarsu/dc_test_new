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
        `SELECT id, prompt, option_a, option_b, option_c, option_d, question_group_id, is_group_header, group_order
         FROM questions
         WHERE is_active = TRUE`,
      );

    if (!questions.length) {
      throw new Error('Question Bank Empty. No questions are available in the system. Please contact support.');
    }

    // Separate questions into groups and standalone questions
    const questionGroups = new Map();
    const standaloneQuestions = [];

    questions.forEach((question) => {
      if (question.question_group_id && question.question_group_id !== null) {
        if (!questionGroups.has(question.question_group_id)) {
          questionGroups.set(question.question_group_id, []);
        }
        questionGroups.get(question.question_group_id).push(question);
      } else {
        standaloneQuestions.push(question);
      }
    });

    // Sort questions within each group by group_order (if set), otherwise by ID to maintain order
    questionGroups.forEach((groupQuestions) => {
      groupQuestions.sort((a, b) => {
        if (a.group_order !== null && b.group_order !== null) {
          return a.group_order - b.group_order;
        }
        if (a.group_order !== null) return -1;
        if (b.group_order !== null) return 1;
        return a.id - b.id;
      });
    });

    // Shuffle standalone questions (zigzag order for individual questions)
    const shuffledStandalone = shuffle(standaloneQuestions);

    // Shuffle groups as units (but keep questions within groups in order)
    const groupArrays = Array.from(questionGroups.values());
    const shuffledGroups = shuffle(groupArrays);

    // Combine: interleave groups and standalone questions randomly
    const allItems = [...shuffledGroups, ...shuffledStandalone.map(q => [q])];
    const finalShuffled = shuffle(allItems);

    // Flatten all questions (including headers) in their final order
    const allQuestions = finalShuffled.flat();
    
    // Assign sequential sequence numbers to actual questions (excluding headers)
    // Headers don't get sequence numbers - they're just instructions
    // This ensures Q1, Q2, Q3... are always sequential regardless of zigzag/group order
    let sequenceCounter = 1;
    const randomizedQuestions = allQuestions.map((question) => {
      if (question.is_group_header) {
        // Header questions don't get sequence numbers (they're instructions)
        return { ...question, sequence: null };
      } else {
        // Actual questions get sequential numbers (Q1, Q2, Q3...) in the order they appear
        return { ...question, sequence: sequenceCounter++ };
      }
    });

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

    // Insert questions in their shuffled order (preserves zigzag for individuals, order for groups)
    // Sequence numbers are assigned sequentially but order is preserved by insertion order
    const placeholders = randomizedQuestions
      .map((_, index) => {
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(', ');
    const values = randomizedQuestions.flatMap((question) => [
      sessionId,
      question.id,
      question.sequence, // Sequential number (Q1, Q2, Q3...) but order preserved by insertion
    ]);

    await connection.query(
      `INSERT INTO session_questions (session_id, question_id, sequence)
       VALUES ${placeholders}`,
      values,
    );

      // Count only actual questions (exclude headers)
      const actualQuestionCount = randomizedQuestions.filter(q => !q.is_group_header).length;

      return {
        sessionId,
        questionCount: actualQuestionCount,
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

  // Fetch questions in insertion order (preserves zigzag for individuals, order for groups)
  // Sequence numbers are sequential (Q1, Q2, Q3...) but order is preserved from insertion
  const [questions] = await pool.query(
    `SELECT
        q.id,
        q.prompt,
        q.option_a AS "optionA",
        q.option_b AS "optionB",
        q.option_c AS "optionC",
        q.option_d AS "optionD",
        q.image_url,
        q.question_group_id,
        q.is_group_header,
        q.group_order,
        COALESCE(q.allows_multiple, FALSE) AS "allowsMultiple",
        sq.sequence
     FROM session_questions sq
     INNER JOIN questions q ON q.id = sq.question_id
     WHERE sq.session_id = $1
     ORDER BY sq.id ASC`,
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

    const [sessionQuestions] = await connection.query(
      `SELECT sq.question_id 
       FROM session_questions sq
       INNER JOIN questions q ON q.id = sq.question_id
       WHERE sq.session_id = $1 AND q.is_group_header = FALSE`,
      [sessionId],
    );

    const validQuestionIds = new Set(sessionQuestions.map((row) => row.question_id));

    // Handle both single-select (string) and multi-select (array) answers
    const sanitizedAnswers = answers
      .filter((answer) => validQuestionIds.has(answer.questionId))
      .map((answer) => {
        const questionId = Number(answer.questionId);
        // Handle multi-select: selectedOption can be array or comma-separated string
        let selectedOption = answer.selectedOption;
        if (Array.isArray(selectedOption)) {
          // Convert array to sorted comma-separated string (e.g., ['C', 'A', 'D'] -> 'A,C,D')
          selectedOption = selectedOption.map(opt => opt.toUpperCase()).sort().join(',');
        } else if (typeof selectedOption === 'string') {
          selectedOption = selectedOption.toUpperCase();
        } else {
          selectedOption = null;
        }
        return {
          questionId,
          selectedOption,
        };
      });

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
      `SELECT id, correct_option AS "correctOption", COALESCE(allows_multiple, FALSE) AS "allowsMultiple"
       FROM questions
       WHERE id = ANY($1::int[]) AND is_group_header = FALSE`,
      [ids],
    );

    const questionMap = new Map(questionRows.map((row) => [
      row.id,
      {
        correctOption: row.correctOption,
        allowsMultiple: row.allowsMultiple,
      },
    ]));

    let totalScore = 0;
    const responseTuples = uniqueAnswers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        return [
          sessionId,
          answer.questionId,
          answer.selectedOption,
          false,
          null,
        ];
      }

      const { correctOption, allowsMultiple } = question;
      let isCorrect = false;
      let partialScore = null;

      if (allowsMultiple && correctOption && correctOption.includes(',')) {
        // Multi-select question: calculate partial marks
        const correctOptions = correctOption.split(',').map(opt => opt.trim()).sort();
        const selectedOptions = answer.selectedOption
          ? answer.selectedOption.split(',').map(opt => opt.trim()).sort()
          : [];

        // Calculate partial score: marks per correct option
        const marksPerOption = 1.0 / correctOptions.length;
        let earnedMarks = 0;

        // Count correct selections
        correctOptions.forEach(opt => {
          if (selectedOptions.includes(opt)) {
            earnedMarks += marksPerOption;
          }
        });

        // Deduct marks for incorrect selections (wrong options selected)
        selectedOptions.forEach(opt => {
          if (!correctOptions.includes(opt)) {
            earnedMarks -= marksPerOption; // Penalty for wrong selection
          }
        });

        // Ensure score is between 0 and 1
        partialScore = Math.max(0, Math.min(1, earnedMarks));
        totalScore += partialScore;
        isCorrect = partialScore === 1.0; // Fully correct only if all correct and no wrong
      } else {
        // Single-select question: full mark or zero
        isCorrect = correctOption && correctOption === answer.selectedOption;
        if (isCorrect) {
          totalScore += 1;
        }
      }

      return [
        sessionId,
        answer.questionId,
        answer.selectedOption,
        Boolean(isCorrect),
        partialScore,
      ];
    });

    await connection.query(
      'DELETE FROM responses WHERE session_id = $1',
      [sessionId],
    );

    const responsePlaceholders = responseTuples
      .map((_, index) => {
        const base = index * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(', ');
    const responseValues = responseTuples.flat();

    await connection.query(
      `INSERT INTO responses
        (session_id, question_id, selected_option, is_correct, partial_score)
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
      [SESSION_STATUS.COMPLETED, Math.round(totalScore * 100) / 100, sessionId], // Round to 2 decimal places
    );

    if (sessionInfo) {
      await logAuditEvent(sessionId, sessionInfo.student_identifier, 'SUBMITTED', Math.round(totalScore * 100) / 100);
    }

    return {
      score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
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

