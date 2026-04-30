import express from 'express';
import EmailConnection from '../models/EmailConnection.js';
import auth from '../middleware/auth.js';
import { validateParamId } from '../middleware/validate.js';
import { deleteConnectionFully } from '../services/connectionCleanupService.js';

const router = express.Router();

// @desc    Get all email connections for the logged-in user
// @route   GET /api/connections
router.get('/', auth, async (req, res) => {
    try {
        const connections = await EmailConnection.find({ userId: req.user.id })
            .select('-accessToken -refreshToken')  // Don't expose tokens in response
            .sort({ createdAt: -1 });

        res.json(connections);
    } catch (error) {
        console.error('Get connections error:', error.message);
        res.status(500).json({ message: 'Failed to fetch connections' });
    }
});

// @desc    Delete a connection and all its data (Pinecone + Mongo + provider unsubscribe)
// @route   DELETE /api/connections/:id
router.delete('/:id', auth, validateParamId, async (req, res) => {
    try {
        const connection = await EmailConnection.findOne({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        await deleteConnectionFully(connection);
        res.json({ message: 'Connection and associated data deleted' });
    } catch (error) {
        console.error('Delete connection error:', error.message);
        res.status(500).json({ message: 'Failed to delete connection' });
    }
});

export default router;
