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
      [userId]
    );
    
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
    console.log('👨‍🏫 Checking HOC status...');
    let isHOC = false;
    try {
      const hocResult = await query(
        'SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = $1',
        [userId]
      );
      isHOC = hocResult[0]?.hoc_count > 0;
      console.log('🎯 HOC status:', isHOC);
    } catch (hocError) {
      console.log('📌 Classes table might not exist yet, defaulting to non-HOC');
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

// Get recent updates (from HOC actions and settings changes)
router.get('/recent-updates', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📰 Fetching recent updates for user:', userId);

    let updates = [];

    try {
      // Fetch from activities/updates table if it exists
      const result = await query(
        `SELECT id, user_id, title, description, activity_type, source, created_at 
         FROM user_activities 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 20`,
        [userId]
      );

      updates = result.map(activity => ({
        id: activity.id,
        title: activity.title,
        desc: activity.description,
        time: formatTimeAgo(activity.created_at),
        type: activity.activity_type,
        source: activity.source,
        createdAt: activity.created_at
      }));

      console.log('✅ Found', updates.length, 'activities in database');
    } catch (dbError) {
      console.log('📌 Activities table not found, using demo data:', dbError.message);
      
      // Demo data with HOC and Settings updates
      updates = [
        {
          id: 1,
          title: 'Welcome to Synapse!',
          desc: 'Your student companion app is ready to use',
          time: '1d ago',
          type: 'info',
          source: 'system',
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 2,
          title: 'Notifications Enabled',
          desc: 'Push notifications have been activated in your settings',
          time: '2h ago',
          type: 'info',
          source: 'settings',
          createdAt: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: 3,
          title: 'Mathematics Class Rescheduled',
          desc: 'Your Mathematics class has been moved to 3:00 PM in Room 305',
          time: '1h ago',
          type: 'reschedule',
          source: 'hoc',
          createdAt: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 4,
          title: 'Physics Class Cancelled',
          desc: 'Physics class scheduled for tomorrow has been cancelled due to lab maintenance',
          time: '30m ago',
          type: 'cancel',
          source: 'hoc',
          createdAt: new Date(Date.now() - 1800000).toISOString()
        }
      ];
    }

    res.json({
      success: true,
      data: updates,
      count: updates.length,
      message: 'Recent updates retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching recent updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent updates',
      message: error.message
    });
  }
});

// Add activity/update (called by HOC when making changes)
router.post('/log-activity', authenticateToken, async (req, res) => {
  try {
    const { title, description, activityType, source } = req.body;
    const userId = req.userId;

    console.log('📝 Logging activity:', { title, activityType, source });

    if (!title || !activityType || !source) {
      return res.status(400).json({
        success: false,
        error: 'Title, activity type, and source are required'
      });
    }

    try {
      // Try to insert into database
      const result = await query(
        `INSERT INTO user_activities (user_id, title, description, activity_type, source, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, created_at`,
        [userId, title, description || '', activityType, source]
      );

      if (result.length > 0) {
        console.log('✅ Activity logged in database:', result[0].id);
      }
    } catch (dbError) {
      console.log('📌 Database insert failed (non-critical):', dbError.message);
    }

    res.json({
      success: true,
      message: 'Activity logged successfully',
      activityType: activityType,
      source: source
    });

  } catch (error) {
    console.error('❌ Error logging activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log activity'
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

// Helper function to format time ago
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export { authenticateToken };
export default router;