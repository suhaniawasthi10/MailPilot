import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
    }
    return Buffer.from(key, 'hex');
};

export const encrypt = (text) => {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decrypt = (encryptedText) => {
    if (!encryptedText) return encryptedText;
    // Legacy plaintext tokens have no colons — pass them through.
    if (!encryptedText.includes(':')) return encryptedText;
    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        // Fail loudly. The previous behavior returned the ciphertext as-is,
        // which then surfaced downstream as opaque OAuth `invalid_grant` errors
        // when really the cause was a missing/rotated TOKEN_ENCRYPTION_KEY.
        console.error('Token decryption failed — TOKEN_ENCRYPTION_KEY may have changed or be missing.');
        throw new Error('Failed to decrypt stored token');
    }
};
