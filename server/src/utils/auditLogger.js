import { pool } from '../db/pool.js';

let activeSessions = new Map();

export async function logAuditEvent(sessionId, studentId, status, score = null, violationReason = null) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
        (session_id, student_identifier, status, score, violation_reason, logged_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, studentId, status, score || null, violationReason || null],
    );

    if (status === 'CONNECTED') {
      activeSessions.set(sessionId, { studentId, status: 'CONNECTED' });
    } else if (status === 'STARTED_TEST') {
      const existing = activeSessions.get(sessionId);
      if (existing) {
        existing.status = 'STARTED_TEST';
        activeSessions.set(sessionId, existing);
      }
    } else if (status === 'KICKED_OUT' || status === 'SUBMITTED') {
      activeSessions.delete(sessionId);
    }

    const timestamp = new Date().toISOString();
    const reasonOutput = violationReason || '';
    console.log(sessionId, studentId, status, reasonOutput, timestamp);
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

export function getActiveSessionCount() {
  return activeSessions.size;
}

