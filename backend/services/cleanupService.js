/**
 * Cleanup Service
 *
 * Auto-deletes completed commitments after 30 days.
 * Keeps the database lean without losing data immediately —
 * users have a 30-day window to undo accidental completions.
 */

import Commitment from '../models/Commitment.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Delete commitments that were completed more than 30 days ago.
 */
const purgeOldCompletedCommitments = async () => {
    try {
        const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

        const result = await Commitment.deleteMany({
            status: 'completed',
            completedAt: { $lt: cutoff },
        });

        if (result.deletedCount > 0) {
            console.log(`Cleanup: purged ${result.deletedCount} completed commitment(s) older than 30 days`);
        }
    } catch (error) {
        console.error('Cleanup error:', error.message);
    }
};

/**
 * Start the cleanup scheduler.
 * Runs once on startup, then every 24 hours.
 */
export const startCleanupScheduler = () => {
    purgeOldCompletedCommitments();

    const ONE_DAY = 24 * 60 * 60 * 1000;
    setInterval(purgeOldCompletedCommitments, ONE_DAY);
};
