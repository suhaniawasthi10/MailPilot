import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        // Provider-agnostic unique ID: "google_<id>" or "microsoft_<id>"
        providerId: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
        },
        name: {
            type: String,
        },
        emailSignature: {
            type: String,
            default: '',
        },
        // accessToken and refreshToken have been moved to EmailConnection model
    },
    {
        timestamps: true,
    }
);

export default mongoose.model('User', userSchema);
