import mongoose from 'mongoose';

const commitmentSchema = new mongoose.Schema(
    {
        // Which connection this commitment belongs to (replaces userId)
        connectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EmailConnection',
            required: true,
        },
        // Which email this commitment was extracted from
        emailId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Email',
            required: true,
        },
        // What the commitment is (e.g., "Send quarterly report to John")
        summary: {
            type: String,
            required: true,
        },
        // When it's due (null if no deadline mentioned)
        deadline: {
            type: Date,
            default: null,
        },
        // Does this email need a reply?
        replyRequired: {
            type: Boolean,
            default: false,
        },
        // Priority level extracted by the LLM
        priority: {
            type: String,
            enum: ['high', 'medium', 'low'],
            default: 'medium',
        },
        // Status tracking
        status: {
            type: String,
            enum: ['pending', 'completed'],
            default: 'pending',
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model('Commitment', commitmentSchema);
