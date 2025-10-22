import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js';

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
    }

    console.log('🔐 Verifying token...');
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    console.log('✅ Token verified for user:', req.userId);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

// Get dashboard data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching dashboard for user ID:', userId);

    // 1. Get user info
    console.log('👤 Querying user data...');
   const userResult = await query(
  'SELECT id, full_name, email, department, academic_year FROM users WHERE id = $1',
  [userId])
    
    if (userResult.length === 0) {
      console.log('❌ User not found in database');
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const user = userResult[0];
    console.log('✅ User found:', user.full_name);

    // 2. Check if user is HOC
    console.log('👑 Checking HOC status...');
    let isHOC = false;
    try {
     const hocResult = await query(
  'SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = $1',
  [userId]
    );
      isHOC = hocResult[0]?.hoc_count > 0;
      console.log('🎯 HOC status:', isHOC);
    } catch (hocError) {
      console.log('📝 Classes table might not exist yet, defaulting to non-HOC');
      isHOC = false;
    }

    // 3. Mock data (since classes table might not exist yet)
    console.log('📋 Generating mock data...');
    const nextClass = {
      id: 1,
      class_name: 'Data Structures',
      instructor: 'Prof. Ahmed',
      start_time: new Date().toISOString(),
      location: 'Lab 302',
      status: 'on'
    };

    const todaySchedule = [
      { id: 1, time: '09:00 AM', class: 'Mathematics', status: 'completed' },
      { id: 2, time: '10:30 AM', class: 'Data Structures', status: 'ongoing' },
      { id: 3, time: '01:00 PM', class: 'Web Development', status: 'upcoming' },
    ];

    const recentUpdates = [
      { 
        id: 1, 
        title: 'Welcome to Synapse!', 
        desc: 'Your student companion app is ready', 
        time: 'Just now', 
        type: 'info' 
      },
      { 
        id: 2, 
        title: 'Schedule Changed', 
        desc: 'Physics class moved to 3 PM', 
        time: '2h ago', 
        type: 'reschedule' 
      },
    ];

    // 4. Format response
    console.log('📦 Sending dashboard response...');
    const responseData = {
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          department: user.department,
          academicYear: user.academic_year,
        },
        nextClass: nextClass,
        todaySchedule: todaySchedule,
        recentUpdates: recentUpdates,
        isHOC: isHOC,
      }
    };

    console.log('✅ Dashboard data sent successfully');
    res.json(responseData);

  } catch (error) {
    console.error('💥 DASHBOARD ERROR:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Test endpoint - no authentication required
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testing homepage routes...');
    
    // Test database connection
    const testResult = await query('SELECT 1 + 1 AS solution');
    console.log('✅ Database test passed:', testResult[0].solution);
    
    res.json({ 
      success: true, 
      message: 'Homepage routes are working',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Test failed: ' + error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Homepage routes are healthy',
    timestamp: new Date().toISOString()
  });
});

// 🔥 ADD THESE EXPORTS - REPLACE THE CURRENT EXPORT
export { authenticateToken };
export default router;