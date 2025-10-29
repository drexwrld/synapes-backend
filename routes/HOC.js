// routes/HOC.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/responseHandler');
// Optional: Import notification sending function if implementing cancellation/reschedule notices
// const { sendNotificationToClass } = require('../utils/pushNotifications'); // Example path

// GET /api/hoc/test (Keep or remove based on need - middleware already confirms HOC)
router.get('/test', (req, res) => {
    // Reaching here means req.user exists and req.user.isHoc is true
    sendSuccess(res, { message: 'HOC access verified successfully', isHOC: true });
});

// GET /api/hoc/my-classes
router.get('/my-classes', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id; // User ID from 'protect' middleware
    console.log(`Fetching classes for HOC user ${hocUserId}`);

    // Fetch classes taught by this HOC, including student count
    const query = `
        SELECT
            c.id, c.class_name, c.subject, c.start_time, c.duration_minutes,
            c.location, c.max_students, c.status,
            COALESCE(e.enrolled_count, 0) as "enrolled_students" -- Use COALESCE for 0 count
        FROM classes c
        LEFT JOIN (
            SELECT class_id, COUNT(*) as enrolled_count
            FROM enrollments
            GROUP BY class_id
        ) e ON c.id = e.class_id
        WHERE c.hoc_id = $1
        ORDER BY c.start_time DESC, c.class_name ASC -- Order by time, then name
    `;
    const result = await pool.query(query, [hocUserId]);

    // Adjust field names/formats if needed for frontend consistency
    const classes = result.rows.map(cls => ({
        ...cls,
        room: cls.location, // Rename location to room if frontend expects 'room'
        max_students: cls.max_students || 30, // Default max students if null
        // Frontend can format date/time from the full start_time timestamp
    }));

    sendSuccess(res, classes);
}));

// POST /api/hoc/create-class
router.post('/create-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    // Destructure expected fields, providing defaults where appropriate
    const {
        className, subject = null, date, time,
        duration = '60', room, maxStudents = '30'
    } = req.body;

    console.log(`HOC ${hocUserId} attempting to create class: ${className}`);

    // --- Validation ---
    if (!className || !date || !time || !room) {
        return sendError(res, 'Missing required fields: Class Name, Date, Time, and Room are required.', 400);
    }
    const durationMinutes = parseInt(duration, 10);
    const maxStudentsNum = parseInt(maxStudents, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
        return sendError(res, 'Duration must be a positive number of minutes.', 400);
    }
    if (isNaN(maxStudentsNum) || maxStudentsNum <= 0) {
        return sendError(res, 'Max Students must be a positive number.', 400);
    }

    // --- Date/Time Parsing & Validation ---
    // Combine date and time, ensuring robust parsing
    let startTime;
    try {
        // Example: Expect 'YYYY-MM-DD' and 'HH:MM' (24-hour)
        const dateTimeString = `${date}T${time}:00`; // Create ISO-like string
        startTime = new Date(dateTimeString);
        // Check if the resulting date is valid
        if (isNaN(startTime.getTime())) {
            throw new Error('Invalid date/time combination');
        }
        // Optional: Check if the date is in the past
        // if (startTime < new Date()) {
        //     return sendError(res, 'Cannot create a class in the past.', 400);
        // }
    } catch (parseError) {
        return sendError(res, 'Invalid date or time format. Use YYYY-MM-DD and HH:MM (24-hour).', 400);
    }

    // --- Database Insertion ---
    const insertQuery = `
        INSERT INTO classes (hoc_id, class_name, subject, start_time, duration_minutes, location, max_students, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *`; // Return the full created class object
    const values = [
        hocUserId, className, subject, startTime,
        durationMinutes, room, maxStudentsNum, 'scheduled' // Default status
    ];
    const result = await pool.query(insertQuery, values);

    console.log(`Class ${result.rows[0].id} created successfully by HOC ${hocUserId}.`);
    sendSuccess(res, result.rows[0], 201); // 201 Created status
}));

// POST /api/hoc/cancel-class
router.post('/cancel-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { classId, reason } = req.body;

    if (!classId || !reason || reason.trim() === '') {
        return sendError(res, 'Class ID and a non-empty Reason are required.', 400);
    }
     if (isNaN(parseInt(classId, 10))) {
        return sendError(res, 'Invalid Class ID format.', 400);
    }

    console.log(`HOC ${hocUserId} attempting to cancel class ${classId}. Reason: ${reason}`);

    // Update status only if the class exists, belongs to the HOC, and isn't already cancelled/completed
    const updateQuery = `
        UPDATE classes
        SET status = 'cancelled'
        WHERE id = $1 AND hoc_id = $2 AND status NOT IN ('cancelled', 'completed')
        RETURNING id, class_name`; // Return id and name for confirmation/notification
    const result = await pool.query(updateQuery, [classId, hocUserId]);

    if (result.rowCount === 0) {
        // Check if class exists but doesn't belong to HOC or is already cancelled/completed
        const checkQuery = 'SELECT id, status FROM classes WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [classId]);
        if (checkResult.rowCount === 0) {
             return sendError(res, 'Class not found.', 404);
        }
        if (checkResult.rows[0].status === 'cancelled' || checkResult.rows[0].status === 'completed') {
             return sendError(res, 'Class cannot be cancelled as it is already completed or cancelled.', 400);
        }
         // If it exists but rowCount was 0, it means HOC doesn't own it
        return sendError(res, 'You are not authorized to cancel this class.', 403);
    }

    // --- Optional: Send Notifications ---
    // Find enrolled students and send them a push notification about the cancellation
    // const className = result.rows[0].class_name;
    // await sendNotificationToClass(classId, `Class Cancelled: ${className}`, `Reason: ${reason}`, { type: 'cancel', classId });

    console.log(`Class ${classId} cancelled successfully by HOC ${hocUserId}.`);
    sendSuccess(res, { message: 'Class cancelled successfully' });
}));

// POST /api/hoc/reschedule-class
router.post('/reschedule-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    // Frontend sends combined datetime string as newTime, e.g., "YYYY-MM-DD HH:MM"
    const { classId, newTime, newRoom, reason = null } = req.body;

    if (!classId || !newTime || !newRoom) {
        return sendError(res, 'Class ID, New Time (YYYY-MM-DD HH:MM), and New Room are required.', 400);
    }
    if (isNaN(parseInt(classId, 10))) {
        return sendError(res, 'Invalid Class ID format.', 400);
    }

    // --- Parse and Validate New Time ---
    let startTime;
    try {
        startTime = new Date(newTime);
        if (isNaN(startTime.getTime())) {
            throw new Error('Invalid date/time format');
        }
        // Optional: Check if new time is in the past
        // if (startTime < new Date()) {
        //     return sendError(res, 'Cannot reschedule a class to the past.', 400);
        // }
    } catch (parseError) {
         return sendError(res, 'Invalid new time format. Use combined date and time like "YYYY-MM-DD HH:MM".', 400);
    }

    console.log(`HOC ${hocUserId} attempting to reschedule class ${classId} to ${startTime.toISOString()} at ${newRoom}.`);

    // --- Database Update ---
    // Update time, location, and status if class belongs to HOC and isn't cancelled/completed
    const updateQuery = `
        UPDATE classes
        SET start_time = $1, location = $2, status = 'rescheduled'
        WHERE id = $3 AND hoc_id = $4 AND status NOT IN ('cancelled', 'completed')
        RETURNING id, class_name`;
    const result = await pool.query(updateQuery, [startTime, newRoom, classId, hocUserId]);

    if (result.rowCount === 0) {
        // Check why update failed
        const checkQuery = 'SELECT id, status FROM classes WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [classId]);
         if (checkResult.rowCount === 0) {
             return sendError(res, 'Class not found.', 404);
        }
        if (checkResult.rows[0].status === 'cancelled' || checkResult.rows[0].status === 'completed') {
             return sendError(res, 'Cannot reschedule a class that is already completed or cancelled.', 400);
        }
        return sendError(res, 'You are not authorized to reschedule this class.', 403);
    }

    // --- Optional: Send Notifications ---
    // const className = result.rows[0].class_name;
    // const formattedTime = startTime.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short'});
    // await sendNotificationToClass(classId, `Class Rescheduled: ${className}`, `Now at ${formattedTime} in ${newRoom}. ${reason ? `Reason: ${reason}` : ''}`, { type: 'reschedule', classId });


    console.log(`Class ${classId} rescheduled successfully by HOC ${hocUserId}.`);
    sendSuccess(res, { message: 'Class rescheduled successfully' });
}));

// GET /api/hoc/students
router.get('/students', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    console.log(`Fetching students for HOC user ${hocUserId}`);

    // Fetch distinct students enrolled in any class currently taught by this HOC
    // Adjust columns and joins based on your schema
    const query = `
        SELECT DISTINCT ON (u.id) -- Select each student only once
            u.id,
            u.full_name as name,
            u.email,
            u.department,
            u.academic_year
            -- Optional: Add count of classes they are enrolled in *with this HOC*
            -- (SELECT COUNT(DISTINCT e2.class_id) FROM enrollments e2 JOIN classes c2 ON e2.class_id = c2.id WHERE e2.student_id = u.id AND c2.hoc_id = $1) as "enrolledClassesCount"
        FROM users u
        JOIN enrollments e ON u.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        WHERE c.hoc_id = $1
        ORDER BY u.id ASC, u.full_name ASC -- DISTINCT ON needs ORDER BY with distinct key first
    `;
    const result = await pool.query(query, [hocUserId]);

    sendSuccess(res, result.rows);
}));


// POST /api/hoc/force-enable-hoc (Mainly for Development/Admin - USE WITH CAUTION)
router.post('/force-enable-hoc', asyncHandler(async (req, res) => {
    const userIdToUpdate = req.user.id; // Get ID from the already verified token

    console.warn(`WARNING: HOC ${userIdToUpdate} is forcing HOC status via API.`);

    const updateQuery = 'UPDATE users SET is_hoc = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id';
    const result = await pool.query(updateQuery, [userIdToUpdate]);

    if (result.rowCount === 0) {
        // This should technically not happen if 'protect' middleware passed
        return sendError(res, 'User not found', 404);
    }

    sendSuccess(res, { message: 'Head of Class privileges forcefully activated!' });
}));


module.exports = router;