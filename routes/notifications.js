// routes/notifications.js
import express from 'express';
import { pool } from '../db.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import fetch from 'node-fetch'; // You may need to install this: npm install node-fetch@2

const router = express.Router();

// --- Push Notification Sending Helper ---
// (This is a placeholder, replace with expo-server-sdk for production)
async function sendExpoPushNotifications(pushTokens, title, body, data) {
    const validTokens = pushTokens.filter(token => typeof token === 'string' && token.startsWith('ExponentPushToken['));
    if (validTokens.length === 0) {
        console.log("No valid Expo push tokens to send.");
        return { success: true, tickets: [], errors: [] };
    }
    console.log(`--- Sending Push Notifications to ${validTokens.length} Expo tokens ---`);

    const messages = validTokens.map(token => ({
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: data,
    }));

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
        });
        if (!response.ok) throw new Error(`Expo API Error (${response.status}): ${await response.text()}`);

        const result = await response.json();
        console.log('Expo Push API Response:', JSON.stringify(result, null, 2));
        const errors = [];
        (result.data || []).forEach((ticket, index) => {
            if (ticket.status === 'error') {
                console.error(`Failed push to ${validTokens[index]}: ${ticket.message}`, ticket.details);
                errors.push({ token: validTokens[index], details: ticket.details, message: ticket.message });
                if (ticket.details?.error === 'DeviceNotRegistered') {
                    removeInvalidPushToken(validTokens[index]); // Fire-and-forget removal
                }
            }
        });
        return { success: errors.length === 0, tickets: result.data || [], errors };
    } catch (error) {
        console.error('Fatal Error calling Expo Push API:', error);
        throw new Error('Failed to communicate with Expo Push Notification service.');
    }
}
async function removeInvalidPushToken(token) {
    try {
        console.log(`Removing invalid/unregistered token: ${token}`);
        await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
    } catch (dbError) { console.error(`Failed to remove invalid token ${token}:`, dbError); }
}
// --- End Push Helper ---

// --- Token Management ---

// POST /api/notifications/register-token
router.post('/register-token', asyncHandler(async (req, res) => {
    const { pushToken } = req.body;
    const userId = req.user.id;
    if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken[')) {
        return sendError(res, 'A valid Expo push token is required.', 400);
    }
    console.log(`Registering token for user ${userId}: ${pushToken}`);
    const query = `
        INSERT INTO push_tokens (user_id, token, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET token = EXCLUDED.token, updated_at = NOW()
        WHERE push_tokens.token IS DISTINCT FROM EXCLUDED.token;`;
    await pool.query(query, [userId, pushToken]);
    sendSuccess(res, { message: 'Token registered.' });
}));

// POST /api/notifications/unregister-token
router.post('/unregister-token', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Unregistering token for user ${userId}`);
    await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    sendSuccess(res, { message: 'Token unregistered.' });
}));

// POST /api/notifications/update-preference
router.post('/update-preference', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { notificationsEnabled } = req.body;
    if (typeof notificationsEnabled !== 'boolean') return sendError(res, 'Invalid preference value.', 400);
    
    console.log(`Updating notification preference for user ${userId} to ${notificationsEnabled}`);
    await pool.query('UPDATE users SET notifications_enabled = $1, updated_at = NOW() WHERE id = $2', [notificationsEnabled, userId]);
    
    if (!notificationsEnabled) {
        console.log(`Notifications disabled, removing token for user ${userId}.`);
        await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    }
    sendSuccess(res, { message: 'Preference updated.' });
}));

// --- Notification Retrieval ---

// GET /api/notifications/get-notifications
router.get('/get-notifications', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Fetching notifications for user ${userId}`);
    const query = `
        SELECT id, title, message, type, source, related_class_id, is_read AS "isRead", created_at AS "createdAt"
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`;
    const { rows } = await pool.query(query, [userId]);
    sendSuccess(res, rows);
}));

// --- Notification Actions ---

// POST /api/notifications/mark-as-read/:id
router.post('/mark-as-read/:id', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10);
    if (isNaN(notificationId)) return sendError(res, 'Invalid notification ID.', 400);
    
    console.log(`Marking notification ${notificationId} as read for user ${userId}`);
    const { rowCount } = await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id', [notificationId, userId]);
    
    if (rowCount === 0) return sendError(res, 'Notification not found or access denied.', 404);
    sendSuccess(res, { message: 'Marked as read.' });
}));

// DELETE /api/notifications/delete-notification/:id
router.delete('/delete-notification/:id', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10);
    if (isNaN(notificationId)) return sendError(res, 'Invalid notification ID.', 400);
    
    console.log(`Deleting notification ${notificationId} for user ${userId}`);
    const { rowCount } = await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [notificationId, userId]);
    
    if (rowCount === 0) return sendError(res, 'Notification not found or access denied.', 404);
    sendSuccess(res, { message: 'Notification deleted.' });
}));

// DELETE /api/notifications/clear-all
router.delete('/clear-all', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Clearing all notifications for user ${userId}`);
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    sendSuccess(res, { message: 'All notifications cleared.' });
}));

// --- HOC Notification Sending ---
// (These routes should be protected by hocOnly middleware in server.js)

// POST /api/notifications/log-notification (For HOC to log their own sent messages)
router.post('/log-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { title, message, type = 'announcement', related_class_id = null } = req.body;
    if (!title || !message) return sendError(res, 'Title and message required.', 400);
    
    console.log(`Logging HOC-sent notification for user ${hocUserId}: ${title}`);
    const query = `
        INSERT INTO notifications (user_id, title, message, type, source, related_class_id, is_read, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'hoc', $5, TRUE, NOW(), NOW()) RETURNING id`;
    await pool.query(query, [hocUserId, title, message, type, related_class_id]);
    sendSuccess(res, { message: 'Notification logged for sender.' }, 201);
}));

// POST /api/notifications/send-class-notification
router.post('/send-class-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { classId, title, message } = req.body;
    const classIdInt = parseInt(classId, 10);
    if (!classIdInt || !title || !message) return sendError(res, 'Class ID, Title, and Message required.', 400);

    console.log(`HOC ${hocUserId} sending notification for class ${classIdInt}: ${title}`);
    
    // Verify HOC owns the class
    const verify = await pool.query('SELECT 1 FROM classes WHERE id = $1 AND hoc_id = $2', [classIdInt, hocUserId]);
    if (verify.rowCount === 0) return sendError(res, 'Class not found or access denied.', 403);

    // Get enabled students and their tokens
    const students = await pool.query(`
        SELECT u.id, pt.token FROM users u
        JOIN enrollments e ON u.id = e.student_id
        LEFT JOIN push_tokens pt ON u.id = pt.user_id
        WHERE e.class_id = $1 AND u.notifications_enabled = TRUE`, [classIdInt]);
    
    const studentIds = students.rows.map(r => r.id);
    const pushTokens = students.rows.map(r => r.token).filter(Boolean);
    console.log(`Found ${studentIds.length} enabled students, ${pushTokens.length} tokens for class ${classIdInt}.`);

    let dbLogCount = 0, pushAttemptCount = 0, pushErrorCount = 0;
    
    // Log to DB
    if (studentIds.length > 0) {
        const logQuery = `INSERT INTO notifications (user_id, title, message, type, source, related_class_id, created_at, updated_at)
                          VALUES ($1, $2, $3, 'class_notification', 'hoc', $4, NOW(), NOW())`;
        try {
            await Promise.all(studentIds.map(id => pool.query(logQuery, [id, title, message, classIdInt])));
            dbLogCount = studentIds.length;
        } catch (dbError) { console.error("DB log error:", dbError); }
    }
    
    // Send Push
    if (pushTokens.length > 0) {
        try {
            const r = await sendExpoPushNotifications(pushTokens, title, message, { type: 'class_notification', classId: classIdInt });
            pushAttemptCount = pushTokens.length;
            pushErrorCount = r.errors.length;
        } catch (pushError) { console.error("Push error:", pushError.message); }
    }
    
    sendSuccess(res, { message: `Processed. Logged: ${dbLogCount}. Push attempts: ${pushAttemptCount}. Errors: ${pushErrorCount}.` });
}));

// POST /api/notifications/broadcast-notification
router.post('/broadcast-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { title, message } = req.body;
    if (!title || !message) return sendError(res, 'Title and Message required.', 400);

    console.log(`HOC ${hocUserId} sending broadcast: ${title}`);
    
    // Get all unique enabled students for this HOC
    const students = await pool.query(`
        SELECT DISTINCT u.id, pt.token FROM users u
        JOIN enrollments e ON u.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        LEFT JOIN push_tokens pt ON u.id = pt.user_id
        WHERE c.hoc_id = $1 AND u.notifications_enabled = TRUE`, [hocUserId]);
    
    const studentIds = students.rows.map(r => r.id);
    const pushTokens = students.rows.map(r => r.token).filter(Boolean);
    console.log(`Found ${studentIds.length} unique students, ${pushTokens.length} tokens for HOC ${hocUserId}.`);

    let dbLogCount = 0, pushAttemptCount = 0, pushErrorCount = 0;
    
    // Log to DB
    if (studentIds.length > 0) {
        const logQuery = `INSERT INTO notifications (user_id, title, message, type, source, created_at, updated_at)
                          VALUES ($1, $2, $3, 'announcement', 'hoc', NOW(), NOW())`;
        try {
            await Promise.all(studentIds.map(id => pool.query(logQuery, [id, title, message])));
            dbLogCount = studentIds.length;
        } catch (dbError) { console.error("DB broadcast log error:", dbError); }
    }
    
    // Send Push
    if (pushTokens.length > 0) {
        try {
            const r = await sendExpoPushNotifications(pushTokens, title, message, { type: 'announcement' });
            pushAttemptCount = pushTokens.length;
            pushErrorCount = r.errors.length;
        } catch (pushError) { console.error("Broadcast push error:", pushError.message); }
    }
    
    // Log for HOC's own records
    try {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, source, is_read, created_at, updated_at)
                          VALUES ($1, $2, $3, 'announcement', 'hoc_sent', TRUE, NOW(), NOW())`, [hocUserId, `Broadcast Sent: ${title}`, message]);
    } catch (hocLogError) { console.error("Error logging HOC's own broadcast:", hocLogError); }

    sendSuccess(res, { message: `Broadcast processed. Logged: ${dbLogCount}. Push attempts: ${pushAttemptCount}. Errors: ${pushErrorCount}.` });
}));

export default router;