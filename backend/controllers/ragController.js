/**
 * RAG Controller
 *
 * Handles HTTP requests for the RAG (Retrieval Augmented Generation) features:
 * - Asking questions about email history
 * - Triggering embedding indexing
 * - Checking index status
 */

import { answerVector, answerVectorless, answerHybrid } from '../services/ragService.js';
import { indexEmails, getIndexStatus } from '../services/embeddingService.js';
import Email from '../models/Email.js';
import EmailConnection from '../models/EmailConnection.js';

/**
 * @desc    Ask a natural language question about your emails
 * @route   POST /api/rag/ask
 * @body    { question, mode?, connectionId? }
 *
 * mode: "vector" | "vectorless" | "hybrid" (default: "hybrid")
 * connectionId: optional — filter to a specific email account
 */
const askQuestion = async (req, res) => {
    try {
        const { question, mode = 'hybrid', connectionId } = req.body;

        if (!question || question.trim().length === 0) {
            return res.status(400).json({ message: 'question is required' });
        }

        // Pick the retrieval strategy based on mode
        let result;
        switch (mode) {
            case 'vector':
                result = await answerVector(question, req.user.id, connectionId);
                break;
            case 'vectorless':
                result = await answerVectorless(question, req.user.id, connectionId);
                break;
            case 'hybrid':
            default:
                result = await answerHybrid(question, req.user.id, connectionId);
                break;
        }

        res.json(result);
    } catch (error) {
        console.error('RAG ask error:', error.message);
        res.status(500).json({ message: 'Failed to process your question' });
    }
};

/**
 * @desc    Trigger embedding of all unembedded emails for the current user
 * @route   POST /api/rag/index
 * @body    { connectionId? }
 *
 * This is a manual trigger. Emails also get auto-indexed on sync (Step 6).
 * Responds immediately with count, runs indexing in background.
 */
const triggerIndex = async (req, res) => {
    try {
        const { connectionId } = req.body;

        // Find user's connections
        const connFilter = { userId: req.user.id };
        if (connectionId) connFilter._id = connectionId;
        const connections = await EmailConnection.find(connFilter).select('_id');
        const connectionIds = connections.map((c) => c._id);

        if (connectionIds.length === 0) {
            return res.status(400).json({ message: 'No email accounts connected' });
        }

        // Find unembedded emails
        const unembedded = await Email.find({
            connectionId: { $in: connectionIds },
            embedded: { $ne: true },
        });

        if (unembedded.length === 0) {
            return res.json({ message: 'All emails are already indexed', indexed: 0 });
        }

        // Respond immediately — indexing runs in the background
        res.json({
            message: `Indexing ${unembedded.length} emails in the background`,
            pending: unembedded.length,
        });

        // Background indexing (same pattern as your background categorization)
        indexEmails(unembedded, req.user.id)
            .then((count) => console.log(`Background indexing complete: ${count} emails embedded`))
            .catch((err) => console.error('Background indexing error:', err.message));

    } catch (error) {
        console.error('RAG index error:', error.message);
        res.status(500).json({ message: 'Failed to trigger indexing' });
    }
};

/**
 * @desc    Get embedding index status (total vs embedded count)
 * @route   GET /api/rag/status?connectionId=xxx
 */
const indexStatus = async (req, res) => {
    try {
        const { connectionId } = req.query;
        const status = await getIndexStatus(req.user.id, connectionId);
        res.json(status);
    } catch (error) {
        console.error('RAG status error:', error.message);
        res.status(500).json({ message: 'Failed to get index status' });
    }
};

export { askQuestion, triggerIndex, indexStatus };
