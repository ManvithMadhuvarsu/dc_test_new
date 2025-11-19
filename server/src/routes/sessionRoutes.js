import { Router } from 'express';
import {
  login,
  fetchQuestions,
  submit,
  violation,
  status,
} from '../controllers/sessionController.js';

const router = Router();

router.post('/login', login);
router.get('/:sessionId/questions', fetchQuestions);
router.post('/:sessionId/submit', submit);
router.post('/:sessionId/violation', violation);
router.get('/:sessionId/status', status);

export default router;

