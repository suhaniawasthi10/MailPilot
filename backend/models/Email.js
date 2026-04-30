import mongoose from 'mongoose';

const emailSchema = new mongoose.Schema(
    {
        // Which connection this email belongs to
        connectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EmailConnection',
            required: true,
        },
        // Provider-agnostic thread/conversation ID
        // Google: threadId, Microsoft: conversationId
        providerThreadId: {
            type: String,
            required: true,
        },
        // Provider-agnostic message ID
        // Google: message id, Microsoft: message id
        providerMessageId: {
            type: String,
            required: true,
            unique: true,
        },
        subject: {
            type: String,
        },
        sender: {
            type: String,
        },
        snippet: {
            type: String,
        },
        body: {
            type: String,
        },
        receivedAt: {
            type: Date,
        },
        isProcessed: {
            type: Boolean,
            default: false,
        },
        // Whether this email has been indexed into the vector store (Pinecone).
        // Used by the RAG pipeline to process only new emails incrementally.
        embedded: {
            type: Boolean,
            default: false,
        },
        embeddedAt: {
            type: Date,
        },
        // Number of vector chunks stored for this email. Pinecone serverless
        // can't delete by metadata filter, so we store the count and rebuild
        // the chunk IDs (`{emailId}#0`..`{emailId}#N-1`) when deleting.
        chunkCount: {
            type: Number,
            default: 0,
        },
        // AI-assigned category for smart inbox
        category: {
            type: String,
            enum: [
                'personal',      // Emails from real people you know
                'work',          // Work-related (meetings, tasks, projects)
                'newsletter',    // Subscribed newsletters, digests
                'marketing',     // Promotions, sales, ads
                'receipt',       // Purchase confirmations, invoices
                'calendar',      // Event invites, RSVPs, schedule changes
                'notification',  // App notifications (GitHub, Slack, etc.)
                'cold-email',    // Unsolicited outreach, sales pitches
                'uncategorized', // Default / not yet categorized
            ],
            default: 'uncategorized',
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model('Email', emailSchema);
