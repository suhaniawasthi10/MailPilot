import mongoose from 'mongoose';

// Validate that connectionId is a valid MongoDB ObjectId
export const validateConnectionId = (source = 'body') => (req, res, next) => {
    const connectionId = source === 'body' ? req.body.connectionId : req.query.connectionId;

    if (!connectionId) {
        return res.status(400).json({ message: 'connectionId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
        return res.status(400).json({ message: 'Invalid connectionId format' });
    }

    next();
};

// Validate that :id param is a valid MongoDB ObjectId
export const validateParamId = (req, res, next) => {
    const id = req.params.id || req.params.emailId;

    if (!id) {
        return res.status(400).json({ message: 'Resource ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid ID format' });
    }

    next();
};
