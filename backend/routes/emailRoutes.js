import express from 'express';
import { syncEmails, getEmails, generateDraft, sendReply } from '../controllers/emailController.js';
import auth from '../middleware/auth.js';
import { validateConnectionId, validateParamId } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Get all synced emails
router.get('/', auth, validateConnectionId('query'), getEmails);

// Sync latest emails from Gmail
router.post('/sync', auth, validateConnectionId('body'), syncEmails);

// Generate AI reply and save as draft (stricter rate limit — calls Groq)
router.post('/generate-draft/:emailId', auth, aiLimiter, validateParamId, generateDraft);

// Send a reply email directly
router.post('/send-reply/:emailId', auth, validateParamId, sendReply);

export default router;
