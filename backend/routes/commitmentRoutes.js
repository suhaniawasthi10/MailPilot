import express from 'express';
import { processEmails, getCommitments, updateCommitment, checkOverdue, addToCalendar } from '../controllers/commitmentController.js';
import auth from '../middleware/auth.js';
import { validateConnectionId, validateParamId } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Get all commitments for the logged-in user
router.get('/', auth, validateConnectionId('query'), getCommitments);

// Process unprocessed emails through Groq LLM (stricter rate limit — calls Groq)
router.post('/extract', auth, aiLimiter, validateConnectionId('body'), processEmails);

// Check for overdue commitments and generate reminder drafts (stricter rate limit — calls Groq)
router.post('/check-overdue', auth, aiLimiter, validateConnectionId('body'), checkOverdue);

// Add commitment deadline to calendar
router.post('/:id/calendar', auth, validateParamId, addToCalendar);

// Mark a commitment as completed
router.patch('/:id', auth, validateParamId, updateCommitment);

export default router;
