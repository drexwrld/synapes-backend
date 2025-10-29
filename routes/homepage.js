// routes/homepage.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Helper function for relative time (can be moved to utils)
function formatRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid date';

        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.round(diffMs / 1000);
        const diffMins = Math.round(diffSecs / 60);
        const diffHours = Math.round(diffMins / 60);
        const diffDays = Math.round(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
        console.error("Error formatting relative time:", e);
        return 'Unknown time';
    }
}

// GET /api/home/dashboard
router.get('/dashboard', asyncHandler(async (req, res) => {
    // req.user is guaranteed to exist here because of the 'protect' middleware
    const userId = req.user.id;
    const user = req.user; // Contains id, fullName, email, department, academicYear, isHoc

    console.log(`Fetching dashboard data for user ${userId}`);

    // Fetch next class and today's schedule in parallel
    // Ensure column names (class_name, start_time, etc.) and joins are correct for your schema
    const nextClassQuery = `
        SELECT
            c.id, c.class_name, c.subject, c.start_time, c.location, c.status,
            COALESCE(instructor.full_name, 'TBA') as instructor
        FROM classes c
        LEFT JOIN users instructor ON c.hoc_id = instructor.id -- Assuming hoc_id links to the instructor
        JOIN enrollments e ON c.id = e.class_id
        WHERE e.student_id = $1
          AND c.start_time >= NOW() -- Only future or currently ongoing classes
          AND c.status NOT IN ('cancelled', 'completed') -- Exclude past/cancelled
        ORDER BY c.start_time ASC
        LIMIT 1`;

    const todayScheduleQuery = `
        SELECT
            c.id, c.class_name as class, c.start_time as time, c.status
        FROM classes c
        JOIN enrollments e ON c.id = e.class_id
        WHERE e.student_id = $1
          AND DATE(c.start_time) = CURRENT_DATE -- Classes scheduled for today
        ORDER BY c.start_time ASC`;

    // Execute queries concurrently
    const [nextClassResult, todayScheduleResult] = await Promise.all([
        pool.query(nextClassQuery, [userId]),
        pool.query(todayScheduleQuery, [userId])
    ]);

    const nextClass = nextClassResult.rows[0] || null;

    // Format time for today's schedule items
    const todaySchedule = todayScheduleResult.rows.map(item => ({
        ...item,
        time: item.time
            ? new Date(item.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : 'TBA' // Handle null times
    }));

    sendSuccess(res, {
        user, // User details from the protect middleware
        nextClass,
        todaySchedule,
        isHOC: user.isHoc // Directly pass HOC status from user object
    });
}));

// GET /api/home/recent-updates
router.get('/recent-updates', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Fetching recent updates for user ${userId}`);

    // Fetch the 5 most recent notifications for the user
    // Ensure column names match your 'notifications' table schema
    const query = `
        SELECT
            id,
            title,
            message as desc,       -- Map DB 'message' to frontend 'desc'
            created_at as time,    -- Map DB 'created_at' to frontend 'time'
            type,                  -- e.g., 'class_notification', 'announcement'
            source,                -- e.g., 'hoc', 'system', 'settings'
            is_read                -- Include read status if needed by frontend logic later
            -- related_class_id   -- Include if you want to link notifications to classes
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`; // Limit the number of updates fetched

    const result = await pool.query(query, [userId]);

    // Format the timestamp into a relative string
    const formattedUpdates = result.rows.map(update => ({
        ...update,
        time: formatRelativeTime(update.time) // Use the helper function
    }));

    sendSuccess(res, formattedUpdates);
}));


module.exports = router;