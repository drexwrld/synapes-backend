// routes/HOC.js
import express from 'express';
import { pool } from '../db.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responceHandler.js';
// import { sendNotificationToClass } from '../utils/pushNotifications.js'; // Example for later

const router = express.Router();

// GET /api/hoc/test
router.get('/test', (req, res) => {
    // This route is only hit if user is authenticated AND hocOnly middleware passed
    sendSuccess(res, { message: 'HOC access verified successfully', isHOC: req.user.isHoc });
});

// GET /api/hoc/my-classes
router.get('/my-classes', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    console.log(`Fetching classes for HOC user ${hocUserId}`);
    const query = `
        SELECT
            c.id, c.class_name, c.subject, c.start_time, c.duration_minutes,
            c.location, c.max_students, c.status,
            COALESCE(e.enrolled_count, 0) as "enrolled_students"
        FROM classes c
        LEFT JOIN (
            SELECT class_id, COUNT(*) as enrolled_count
            FROM enrollments
            GROUP BY class_id
        ) e ON c.id = e.class_id
        WHERE c.hoc_id = $1
        ORDER BY c.start_time DESC, c.class_name ASC`;
    const result = await pool.query(query, [hocUserId]);
    
    const classes = result.rows.map(cls => ({
        ...cls,
        room: cls.location, // Rename for frontend
        max_students: cls.max_students || 30,
    }));
    sendSuccess(res, classes);
}));

// POST /api/hoc/create-class
router.post('/create-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { className, subject = null, date, time, duration = '60', room, maxStudents = '30' } = req.body;

    if (!className || !date || !time || !room) {
        return sendError(res, 'Class Name, Date, Time, and Room are required.', 400);
    }
    const durationMinutes = parseInt(duration, 10);
    const maxStudentsNum = parseInt(maxStudents, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) return sendError(res, 'Duration must be > 0.', 400);
    if (isNaN(maxStudentsNum) || maxStudentsNum <= 0) return sendError(res, 'Max Students must be > 0.', 400);

    let startTime;
    try {
        const dateTimeString = `${date}T${time}:00`;
        startTime = new Date(dateTimeString);
        if (isNaN(startTime.getTime())) throw new Error('Invalid date/time');
    } catch (e) { return sendError(res, 'Invalid date/time format. Use YYYY-MM-DD and HH:MM.', 400); }

    const query = `INSERT INTO classes (hoc_id, class_name, subject, start_time, duration_minutes, location, max_students, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW(), NOW()) RETURNING *`;
    const values = [hocUserId, className, subject, startTime, durationMinutes, room, maxStudentsNum];
    const result = await pool.query(query, values);
    
    console.log(`Class ${result.rows[0].id} created by HOC ${hocUserId}.`);
    sendSuccess(res, result.rows[0], 201);
}));

// POST /api/hoc/cancel-class
router.post('/cancel-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { classId, reason } = req.body;
    const classIdInt = parseInt(classId, 10);

    if (!classIdInt || !reason || reason.trim() === '') {
        return sendError(res, 'Class ID and Reason are required.', 400);
    }

    const update = `UPDATE classes SET status = 'cancelled'
                    WHERE id = $1 AND hoc_id = $2 AND status NOT IN ('cancelled', 'completed')
                    RETURNING id, class_name`;
    const result = await pool.query(update, [classIdInt, hocUserId]);

    if (result.rowCount === 0) {
        const check = await pool.query('SELECT id, status FROM classes WHERE id = $1', [classIdInt]);
        if (check.rowCount === 0) return sendError(res, 'Class not found.', 404);
        if (check.rows[0].status === 'cancelled' || check.rows[0].status === 'completed') return sendError(res, 'Class already completed or cancelled.', 400);
        return sendError(res, 'You are not authorized to cancel this class.', 403);
    }
    
    // Optional: await sendNotificationToClass(classIdInt, `Class Cancelled: ${result.rows[0].class_name}`, `Reason: ${reason}`, { type: 'cancel', classId: classIdInt });
    console.log(`Class ${classIdInt} cancelled by HOC ${hocUserId}.`);
    sendSuccess(res, { message: 'Class cancelled successfully' });
}));

// POST /api/hoc/reschedule-class
router.post('/reschedule-class', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    const { classId, newTime, newRoom, reason = null } = req.body;
    const classIdInt = parseInt(classId, 10);

    if (!classIdInt || !newTime || !newRoom) {
        return sendError(res, 'Class ID, New Time (YYYY-MM-DD HH:MM), and New Room are required.', 400);
    }

    let startTime;
    try {
        startTime = new Date(newTime);
        if (isNaN(startTime.getTime())) throw new Error('Invalid date/time');
    } catch (e) { return sendError(res, 'Invalid new time format. Use "YYYY-MM-DD HH:MM".', 400); }

    const update = `UPDATE classes SET start_time = $1, location = $2, status = 'rescheduled'
                    WHERE id = $3 AND hoc_id = $4 AND status NOT IN ('cancelled', 'completed')
                    RETURNING id, class_name`;
    const result = await pool.query(update, [startTime, newRoom, classIdInt, hocUserId]);

    if (result.rowCount === 0) {
        const check = await pool.query('SELECT id, status FROM classes WHERE id = $1', [classIdInt]);
        if (check.rowCount === 0) return sendError(res, 'Class not found.', 404);
        if (check.rows[0].status === 'cancelled' || check.rows[0].status === 'completed') return sendError(res, 'Cannot reschedule completed or cancelled class.', 400);
        return sendError(res, 'You are not authorized to reschedule this class.', 403);
    }
    
    // Optional: Send notifications
    // const formattedTime = startTime.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short'});
    // await sendNotificationToClass(classIdInt, `Class Rescheduled: ${result.rows[0].class_name}`, `Now at ${formattedTime} in ${newRoom}. ${reason ? `Reason: ${reason}` : ''}`, { type: 'reschedule', classId: classIdInt });
    
    console.log(`Class ${classIdInt} rescheduled by HOC ${hocUserId}.`);
    sendSuccess(res, { message: 'Class rescheduled successfully' });
}));

// GET /api/hoc/students
router.get('/students', asyncHandler(async (req, res) => {
    const hocUserId = req.user.id;
    console.log(`Fetching students for HOC user ${hocUserId}`);
    
    const query = `
        SELECT DISTINCT ON (u.id) u.id, u.full_name as name, u.email, u.department, u.academic_year
        FROM users u
        JOIN enrollments e ON u.id = e.student_id
        JOIN classes c ON e.class_id = c.id
        WHERE c.hoc_id = $1
        ORDER BY u.id ASC, u.full_name ASC`;
    const result = await pool.query(query, [hocUserId]);
    
    sendSuccess(res, result.rows);
}));

// POST /api/hoc/force-enable-hoc
router.post('/force-enable-hoc', asyncHandler(async (req, res) => {
    const userIdToUpdate = req.user.id;
    console.warn(`WARNING: User ${userIdToUpdate} is forcing HOC status via API.`);
    
    const result = await pool.query('UPDATE users SET is_hoc = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id', [userIdToUpdate]);
    
    if (result.rowCount === 0) {
        return sendError(res, 'User not found', 404);
    }
    sendSuccess(res, { message: 'Head of Class privileges forcefully activated!' });
}));

export default router;