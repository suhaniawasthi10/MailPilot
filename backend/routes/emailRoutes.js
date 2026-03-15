import express from 'express';
import { syncEmails, getEmails, generateDraft, sendReply, composeEmail, generateCompose, getThread, forwardEmail, sendThreadReply } from '../controllers/emailController.js';
import auth from '../middleware/auth.js';
import { validateConnectionId, validateParamId } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Get all synced emails
router.get('/', auth, validateConnectionId('query'), getEmails);

// Get full thread for an email
router.get('/thread/:emailId', auth, validateParamId, getThread);

// Sync latest emails from Gmail
router.post('/sync', auth, validateConnectionId('body'), syncEmails);

// Generate AI reply and save as draft (stricter rate limit — calls Groq)
router.post('/generate-draft/:emailId', auth, aiLimiter, validateParamId, generateDraft);

// Send a reply email directly
router.post('/send-reply/:emailId', auth, validateParamId, sendReply);

// Send a reply within a thread (reply / reply-all)
router.post('/thread-reply', auth, sendThreadReply);

// Forward an email
router.post('/forward/:emailId', auth, validateParamId, forwardEmail);

// Compose and send a new email
router.post('/compose', auth, validateConnectionId('body'), composeEmail);

// Generate AI-written email body for compose
router.post('/generate-compose', auth, aiLimiter, generateCompose);

export default router;
