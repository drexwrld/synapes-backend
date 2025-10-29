// routes/homepage.js
import express from 'express';
import { pool } from '../db.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';

const router = express.Router();

// Helper function (move to a utils file if used elsewhere)
function formatRelativeTime(dateString) {
    if (!dateString) return 'Some time ago';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid date';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
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
    // req.user is populated by the 'protect' middleware
    const userId = req.user.id;
    const user = req.user; // User object is already available

    console.log(`Fetching dashboard data for user ${userId}`);

    // Fetch next class and today's schedule in parallel
    const nextClassQuery = `
        SELECT
            c.id, c.class_name, c.subject, c.start_time, c.location, c.status,
            COALESCE(instructor.full_name, 'TBA') as instructor
        FROM classes c
        LEFT JOIN users instructor ON c.hoc_id = instructor.id
        JOIN enrollments e ON c.id = e.class_id
        WHERE e.student_id = $1
          AND c.start_time >= NOW()
          AND c.status NOT IN ('cancelled', 'completed')
        ORDER BY c.start_time ASC
        LIMIT 1`;

    const todayScheduleQuery = `
        SELECT
            c.id, c.class_name as class, c.start_time as time, c.status
        FROM classes c
        JOIN enrollments e ON c.id = e.class_id
        WHERE e.student_id = $1
          AND DATE(c.start_time) = CURRENT_DATE
        ORDER BY c.start_time ASC`;

    const [nextClassResult, todayScheduleResult] = await Promise.all([
        pool.query(nextClassQuery, [userId]),
        pool.query(todayScheduleQuery, [userId])
    ]);

    const nextClass = nextClassResult.rows[0] || null;
    
    const todaySchedule = todayScheduleResult.rows.map(item => ({
        ...item,
        time: item.time
            ? new Date(item.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : 'TBA'
    }));

    sendSuccess(res, {
        user, // Send the full user object from middleware
        nextClass,
        todaySchedule,
        isHOC: user.isHoc // Explicitly include isHOC
    });
}));

// GET /api/home/recent-updates
router.get('/recent-updates', asyncHandler(async (req, res) => {
    const userId = req.user.id;
    console.log(`Fetching recent updates for user ${userId}`);

    // Fetch latest 5 notifications
    const query = `
        SELECT
            id,
            title,
            message as desc,
            created_at as time,
            type,
            source,
            is_read
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`;

    const result = await pool.query(query, [userId]);

    const formattedUpdates = result.rows.map(update => ({
        ...update,
        time: formatRelativeTime(update.time)
    }));

    sendSuccess(res, formattedUpdates);
}));

export default router;