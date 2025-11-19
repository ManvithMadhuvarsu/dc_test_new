import {
  createSecureSession,
  getSessionQuestions,
  submitExam,
  logViolation,
  getSessionStatus,
} from '../services/sessionService.js';
import { getActiveSessionCount } from '../utils/auditLogger.js';

export async function login(req, res, next) {
  try {
    const session = await createSecureSession(req.body);
    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

export async function fetchQuestions(req, res, next) {
  try {
    const { sessionId } = req.params;
    const questions = await getSessionQuestions(sessionId);
    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    next(error);
  }
}

export async function submit(req, res, next) {
  try {
    const { sessionId } = req.params;
    const result = await submitExam(sessionId, req.body.answers);
    res.json({
      success: true,
      data: {
        totalQuestions: result.totalQuestions,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function violation(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;
    const result = await logViolation(sessionId, reason);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function status(req, res, next) {
  try {
    const { sessionId } = req.params;
    const sessionStatus = await getSessionStatus(sessionId);
    res.json({
      success: true,
      data: sessionStatus,
    });
  } catch (error) {
    next(error);
  }
}

