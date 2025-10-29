// routes/notifications.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/responseHandler');
// Assume push notification helper exists:
// const { sendExpoPushNotifications } = require('../utils/pushNotifications'); // Needs implementation

// --- Helper Placeholder (Replace with actual Expo SDK logic) ---
// IMPORTANT: This needs to be implemented using expo-server-sdk or direct API calls
async function sendExpoPushNotifications(pushTokens, title, body, data) {
    if (!pushTokens || pushTokens.length === 0) {
        console.log("No valid push tokens provided to sendExpoPushNotifications.");
        return { success: true, tickets: [], errors: [] }; // Indicate success but nothing sent
    }
    console.log(`--- Sending Mock Expo Push Notifications to ${pushTokens.length} tokens ---`);
    console.log('Title:', title);
    console.log('Body:', body);
    console.log('Data:', data);
    console.log('Tokens:', pushTokens);
    console.log('---------------------------------------');

    // Filter out invalid token formats before sending (basic check)
    const validTokens = pushTokens.filter(token => typeof token === 'string' && token.startsWith('ExponentPushToken['));
    if(validTokens.length !== pushTokens.length) {
        console.warn(`Filtered out ${pushTokens.length - validTokens.length} invalid push tokens.`);
    }
    if (validTokens.length === 0) {
         console.log("No valid Expo push tokens found to send.");
         return { success: true, tickets: [], errors: [] };
    }


    const messages = validTokens.map(token => ({
        to: token,
        sound: 'default', // Or use custom sound name from app.json
        title: title,
        body: body,
        data: data, // Attach extra data payload
        // Add other options like priority, badge count, channelId etc. if needed
        // See: https://docs.expo.dev/push-notifications/sending-notifications/#message-request-format
    }));

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
                // Add Authorization header if using Expo Access Token (recommended for server-side)
                // 'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
            },
            body: JSON.stringify(messages),
        });

        // Check for non-2xx status code
        if (!response.ok) {
             const errorBody = await response.text();
             console.error(`Expo Push API Error (${response.status}): ${errorBody}`);
             throw new Error(`Expo API request failed with status ${response.status}`);
        }

        const result = await response.json();
        console.log('Expo Push API Response:', JSON.stringify(result, null, 2));

        // Check for errors within the Expo response tickets
        const errors = [];
        if (result.data && Array.isArray(result.data)) {
            result.data.forEach((ticket, index) => {
                if (ticket.status === 'error') {
                    console.error(`Failed to send notification to token ${validTokens[index]}: ${ticket.message}`, ticket.details);
                    errors.push({ token: validTokens[index], details: ticket.details, message: ticket.message });
                    // Handle specific errors like 'DeviceNotRegistered' by potentially removing the token
                     if (ticket.details?.error === 'DeviceNotRegistered') {
                         removeInvalidPushToken(validTokens[index]); // Implement this function
                     }
                }
            });
        }
        return { success: errors.length === 0, tickets: result.data || [], errors };

    } catch (error) {
        console.error('Fatal Error calling Expo Push API:', error);
        // Rethrow a more specific error or return structured error info
        throw new Error('Failed to communicate with Expo Push Notification service.');
    }
}

// Helper to remove invalid tokens from DB (implement this)
async function removeInvalidPushToken(token) {
    try {
        console.log(`Removing invalid push token: ${token}`);
        await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
    } catch (dbError) {
        console.error(`Failed to remove invalid push token ${token} from database:`, dbError);
    }
}
// --- End Helper Placeholder ---


// --- Push Token Management ---

// POST /api/notifications/register-token
router.post('/register-token', asyncHandler(async (req, res) => {
    const { pushToken } = req.body;
    const userId = req.user.id;

    if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken[')) {
        return sendError(res, 'A valid Expo push token (string) is required.', 400);
    }
    console.log(`Registering/Updating token for user ${userId}: ${pushToken}`);
    const query = `
        INSERT INTO push_tokens (user_id, token, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET token = EXCLUDED.token, updated_at = NOW()
        WHERE push_tokens.token IS DISTINCT FROM EXCLUDED.token;`;
    await pool.query(query, [userId, pushToken]);
    sendSuccess(res, { message: 'Push token registered successfully.' });
}));

// POST /api/notifications/unregister-token
router.post('/unregister-token', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Unregistering any token for user ${userId}`);
    const query = 'DELETE FROM push_tokens WHERE user_id = $1';
    await pool.query(query, [userId]);
    sendSuccess(res, { message: 'Push token unregistered successfully.' });
}));

// POST /api/notifications/update-preference
router.post('/update-preference', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { notificationsEnabled } = req.body;

    if (typeof notificationsEnabled !== 'boolean') {
        return sendError(res, 'Invalid preference value, boolean expected.', 400);
    }
    console.log(`Updating notification preference for user ${userId} to: ${notificationsEnabled}`);
    // Assume 'users' table has 'notifications_enabled' column
    const updateQuery = 'UPDATE users SET notifications_enabled = $1, updated_at = NOW() WHERE id = $2';
    await pool.query(updateQuery, [notificationsEnabled, userId]);

    if (!notificationsEnabled) {
        console.log(`Notifications disabled, removing push token for user ${userId}.`);
        await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    }
    sendSuccess(res, { message: 'Notification preference updated successfully.' });
}));


// --- Notification Retrieval & Management ---

// GET /api/notifications/get-notifications
router.get('/get-notifications', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Fetching notifications for user ${userId}`);
    const query = `
        SELECT
            id, title, message, type, source, related_class_id,
            is_read AS "isRead",
            created_at AS "createdAt"
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`; // Add a sensible limit
    const result = await pool.query(query, [userId]);
    sendSuccess(res, result.rows);
}));

// POST /api/notifications/mark-as-read/:id
router.post('/mark-as-read/:id', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10); // Ensure ID is integer

    if (isNaN(notificationId)) {
        return sendError(res, 'Invalid notification ID provided.', 400);
    }
    console.log(`Marking notification ${notificationId} as read for user ${userId}`);
    const query = 'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id';
    const result = await pool.query(query, [notificationId, userId]);

    if (result.rowCount === 0) {
        return sendError(res, 'Notification not found or access denied.', 404);
    }
    sendSuccess(res, { message: 'Notification marked as read.' });
}));

// DELETE /api/notifications/delete-notification/:id
router.delete('/delete-notification/:id', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10); // Ensure ID is integer

    if (isNaN(notificationId)) {
        return sendError(res, 'Invalid notification ID provided.', 400);
    }
    console.log(`Deleting notification ${notificationId} for user ${userId}`);
    const query = 'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id';
    const result = await pool.query(query, [notificationId, userId]);

    if (result.rowCount === 0) {
        return sendError(res, 'Notification not found or access denied.', 404);
    }
    sendSuccess(res, { message: 'Notification deleted successfully.' });
}));

// DELETE /api/notifications/clear-all
router.delete('/clear-all', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Clearing all notifications for user ${userId}`);
    const query = 'DELETE FROM notifications WHERE user_id = $1';
    await pool.query(query, [userId]);
    sendSuccess(res, { message: 'All notifications cleared successfully.' });
}));

// --- HOC Specific Notification Actions ---
// These should be protected by hocOnly middleware in server.js

// POST /api/notifications/log-notification (For HOC logging their own sent msgs)
router.post('/log-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { title, message, type = 'announcement', related_class_id = null } = req.body;

    if (!title || !message) {
        return sendError(res, 'Title and message are required for logging.', 400);
    }
    console.log(`Logging HOC notification sent by user ${hocUserId}: ${title}`);
    const query = `
        INSERT INTO notifications (user_id, title, message, type, source, related_class_id, is_read, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'hoc', $5, TRUE, NOW(), NOW())
        RETURNING id`; // Log as read for the sender
    await pool.query(query, [hocUserId, title, message, type, related_class_id]);
    sendSuccess(res, { message: 'Notification logged for sender.' }, 201);
}));

// POST /api/notifications/send-class-notification
router.post('/send-class-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { classId, title, message } = req.body;

    if (!classId || !title || !message) {
        return sendError(res, 'Class ID, Title, and Message are required.', 400);
    }
    const classIdInt = parseInt(classId, 10);
     if (isNaN(classIdInt)) {
        return sendError(res, 'Invalid Class ID format.', 400);
    }

    console.log(`HOC ${hocUserId} sending notification for class ${classIdInt}: ${title}`);

    // 1. Verify HOC owns the class
    const verifyResult = await pool.query('SELECT id FROM classes WHERE id = $1 AND hoc_id = $2', [classIdInt, hocUserId]);
    if (verifyResult.rowCount === 0) {
        return sendError(res, 'Class not found or you do not manage this class.', 403);
    }

    // 2. Get students' IDs and push tokens for the class
    const studentsQuery = `
        SELECT u.id, pt.token
        FROM users u
        JOIN enrollments e ON u.id = e.student_id
        LEFT JOIN push_tokens pt ON u.id = pt.user_id -- Left join to get ID even if no token
        WHERE e.class_id = $1 AND u.notifications_enabled = TRUE`; // Only enabled users
    const studentsResult = await pool.query(studentsQuery, [classIdInt]);
    const studentIds = studentsResult.rows.map(row => row.id);
    const pushTokens = studentsResult.rows.map(row => row.token).filter(Boolean); // Filter null/empty tokens

    console.log(`Found ${studentIds.length} enabled students for class ${classIdInt}. Tokens found: ${pushTokens.length}.`);

    let dbLogCount = 0;
    let pushAttemptCount = 0;
    let pushErrorCount = 0;

    // 3. Log notification in DB for each recipient
    if (studentIds.length > 0) {
        const logQuery = `
            INSERT INTO notifications (user_id, title, message, type, source, related_class_id, created_at, updated_at)
            VALUES ($1, $2, $3, 'class_notification', 'hoc', $4, NOW(), NOW())`;
        const logPromises = studentIds.map(studentId =>
            pool.query(logQuery, [studentId, title, message, classIdInt])
        );
        try {
            await Promise.all(logPromises);
            dbLogCount = studentIds.length;
            console.log(`Logged notification in DB for ${dbLogCount} students.`);
        } catch (dbError) {
            console.error("Error logging class notifications to DB:", dbError);
            // Decide how to proceed - maybe return partial error?
        }
    }

    // 4. Send push notifications
    if (pushTokens.length > 0) {
        try {
            const pushResult = await sendExpoPushNotifications(pushTokens, title, message, { type: 'class_notification', classId: classIdInt });
            pushAttemptCount = pushTokens.length;
            pushErrorCount = pushResult.errors.length;
            console.log(`Push notification attempt finished for class ${classIdInt}. Errors: ${pushErrorCount}`);
        } catch (pushError) {
            console.error("Error during push notification sending process:", pushError.message);
            // Log error but potentially still return success if DB log worked
        }
    }

    sendSuccess(res, {
        message: `Notification processed. Logged for ${dbLogCount} students. Push attempted for ${pushAttemptCount} devices with ${pushErrorCount} errors.`
    });
}));

// POST /api/notifications/broadcast-notification
router.post('/broadcast-notification', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { title, message } = req.body;

    if (!title || !message) {
        return sendError(res, 'Title and Message are required for broadcast.', 400);
    }
    console.log(`HOC ${hocUserId} sending broadcast: ${title}`);

    // 1. Get unique, enabled students of this HOC and their tokens
    const studentsQuery = `
        SELECT DISTINCT u.id, pt.token
        FROM users u
        JOIN enrollments e ON u.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        LEFT JOIN push_tokens pt ON u.id = pt.user_id
        WHERE c.hoc_id = $1 AND u.notifications_enabled = TRUE`;
    const studentsResult = await pool.query(studentsQuery, [hocUserId]);
    const studentIds = studentsResult.rows.map(row => row.id);
    const pushTokens = studentsResult.rows.map(row => row.token).filter(Boolean);

    console.log(`Found ${studentIds.length} unique enabled students for HOC ${hocUserId}. Tokens found: ${pushTokens.length}.`);

    let dbLogCount = 0;
    let pushAttemptCount = 0;
    let pushErrorCount = 0;

    // 2. Log broadcast in DB for each recipient
    if (studentIds.length > 0) {
        const logQuery = `
            INSERT INTO notifications (user_id, title, message, type, source, created_at, updated_at)
            VALUES ($1, $2, $3, 'announcement', 'hoc', NOW(), NOW())`;
        const logPromises = studentIds.map(studentId =>
            pool.query(logQuery, [studentId, title, message])
        );
         try {
            await Promise.all(logPromises);
            dbLogCount = studentIds.length;
            console.log(`Logged broadcast in DB for ${dbLogCount} students.`);
         } catch (dbError) {
             console.error("Error logging broadcast to DB:", dbError);
         }
    }

    // 3. Send push notifications
    if (pushTokens.length > 0) {
        try {
            const pushResult = await sendExpoPushNotifications(pushTokens, title, message, { type: 'announcement' });
            pushAttemptCount = pushTokens.length;
            pushErrorCount = pushResult.errors.length;
            console.log(`Broadcast push attempt finished for HOC ${hocUserId}. Errors: ${pushErrorCount}`);
        } catch (pushError) {
             console.error("Error during broadcast push sending process:", pushError.message);
        }
    }

    // Also log the broadcast for the HOC themselves
    try {
        const hocLogQuery = `
            INSERT INTO notifications (user_id, title, message, type, source, is_read, created_at, updated_at)
            VALUES ($1, $2, $3, 'announcement', 'hoc_sent', TRUE, NOW(), NOW())`; // Different source, mark as read
        await pool.query(hocLogQuery, [hocUserId, `Broadcast Sent: ${title}`, message]);
        console.log(`Logged sent broadcast for HOC ${hocUserId}.`);
    } catch (hocLogError) {
        console.error("Error logging HOC's own broadcast:", hocLogError);
    }


    sendSuccess(res, {
        message: `Broadcast processed. Logged for ${dbLogCount} students. Push attempted for ${pushAttemptCount} devices with ${pushErrorCount} errors.`
    });
}));


module.exports = router;