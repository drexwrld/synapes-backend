import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  req.userId = 1; // Replace with actual user ID from token
  next();
};

// Get dashboard data
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Get user info
    const userResult = await query(
      'SELECT full_name, email, department, academic_year FROM users WHERE id = ?',
      [userId]
    );
    const user = userResult[0];

    // Get next class
    const nextClass = await query(
      `SELECT id, class_name, instructor, start_time, end_time, location, status 
       FROM classes 
       WHERE user_id = ? AND start_time > NOW()
       ORDER BY start_time ASC
       LIMIT 1`,
      [userId]
    );

    // Get today's classes
    const todayClasses = await query(
      `SELECT id, class_name, instructor, start_time, end_time, location, status 
       FROM classes 
       WHERE user_id = ? AND DATE(start_time) = CURDATE()
       ORDER BY start_time ASC`,
      [userId]
    );

    // Get recent updates
    const updates = await query(
      `SELECT id, title, description, update_type, created_at 
       FROM schedule_updates 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        user: {
          name: user?.full_name,
          department: user?.department,
          academicYear: user?.academic_year,
        },
        nextClass: nextClass[0] || null,
        todaySchedule: todayClasses.map(c => ({
          id: c.id,
          time: new Date(c.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          class: c.class_name,
          status: 'upcoming',
        })),
        recentUpdates: updates.map(u => ({
          id: u.id,
          title: u.title,
          desc: u.description,
          time: '2h ago',
          type: u.update_type,
        })),
        isHOC: false,
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;