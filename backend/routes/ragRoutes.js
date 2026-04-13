import express from 'express';
import { askQuestion, triggerIndex, indexStatus } from '../controllers/ragController.js';
import auth from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Ask a question — uses AI (Groq), so gets the stricter rate limit
router.post('/ask', auth, aiLimiter, askQuestion);

// Trigger indexing of unembedded emails
router.post('/index', auth, triggerIndex);

// Get index status (how many emails are embedded)
router.get('/status', auth, indexStatus);

export default router;
