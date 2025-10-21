import express from 'express';
import { query } from '../db.js';
import { verifyToken as verifyJWT } from '../utils/jwt.js'; // Renamed import

const router = express.Router();

// Middleware to verify JWT token - FIXED: No naming conflict
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  
  try {
    const decoded = verifyJWT(token); // Use the renamed import
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Get dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching dashboard for user ID:', userId);

    // Get user info
    const userResult = await query(
      'SELECT id, full_name, email, department, academic_year FROM users WHERE id = ?',
      [userId]
    );
    
    if (userResult.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult[0];
    console.log('👤 User found:', user.full_name);

    // Get next class (mock data for now - you'll need to create classes table)
    const nextClass = {
      id: 1,
      class_name: 'Data Structures',
      instructor: 'Prof. Ahmed',
      start_time: new Date().setHours(10, 30, 0, 0),
      location: 'Lab 302',
      status: 'on'
    };

    // Get today's classes (mock data for now)
    const todaySchedule = [
      { id: 1, time: '09:00 AM', class: 'Mathematics', status: 'completed' },
      { id: 2, time: '10:30 AM', class: 'Data Structures', status: 'ongoing' },
      { id: 3, time: '01:00 PM', class: 'Web Development', status: 'upcoming' },
    ];

    // Get recent updates (mock data for now)
    const recentUpdates = [
      { id: 1, title: 'Schedule Changed', desc: 'Physics class moved to 3 PM', time: '2h ago', type: 'reschedule' },
      { id: 2, title: 'Class Cancelled', desc: 'Chemistry lab cancelled today', time: '4h ago', type: 'cancel' },
    ];

    // Check if user is HOC
    const hocResult = await query(
      'SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = ?',
      [userId]
    );
    const isHOC = hocResult[0]?.hoc_count > 0;

    console.log('✅ Sending dashboard data for:', user.full_name);

    // Format response with CORRECT field names
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name, // Correct field name
          email: user.email,
          department: user.department,
          academicYear: user.academic_year,
        },
        nextClass: nextClass,
        todaySchedule: todaySchedule,
        recentUpdates: recentUpdates,
        isHOC: isHOC,
      }
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error: ' + error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Homepage routes are working',
    timestamp: new Date().toISOString()
  });
});

export default router;