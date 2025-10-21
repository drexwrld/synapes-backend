import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId; // Use the actual user ID from the token
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Get dashboard data
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching dashboard for user ID:', userId);

    // Get user info - FIXED: Use correct column names from your database
    const userResult = await query(
      'SELECT id, full_name, email, department, academic_year FROM users WHERE id = ?',
      [userId]
    );
    
    if (userResult.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult[0];
    console.log('👤 User found:', user.full_name);

    // Get next class
    const nextClassResult = await query(
      `SELECT id, class_name, instructor, start_time, end_time, location, status 
       FROM classes 
       WHERE user_id = ? AND start_time > NOW()
       ORDER BY start_time ASC
       LIMIT 1`,
      [userId]
    );

    // Get today's classes
    const todayClassesResult = await query(
      `SELECT id, class_name, instructor, start_time, end_time, location, status 
       FROM classes 
       WHERE user_id = ? AND DATE(start_time) = CURDATE()
       ORDER BY start_time ASC`,
      [userId]
    );

    // Get recent updates
    const updatesResult = await query(
      `SELECT id, title, description, update_type, created_at 
       FROM schedule_updates 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Check if user is HOC
    const hocResult = await query(
      'SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = ?',
      [userId]
    );
    const isHOC = hocResult[0].hoc_count > 0;

    // Format response with CORRECT field names
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name, // FIXED: Use full_name from database
          email: user.email,
          department: user.department,
          academicYear: user.academic_year,
        },
        nextClass: nextClassResult[0] || null,
        todaySchedule: todayClassesResult.map(c => ({
          id: c.id,
          time: new Date(c.start_time).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          class: c.class_name,
          status: c.status || 'upcoming',
        })),
        recentUpdates: updatesResult.map(u => ({
          id: u.id,
          title: u.title,
          desc: u.description,
          time: '2h ago', // You can format this properly later
          type: u.update_type,
        })),
        isHOC: isHOC,
      }
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;