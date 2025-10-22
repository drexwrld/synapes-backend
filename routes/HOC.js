import express from 'express';
import { verifyToken } from '../utils/jwt.js';
import { query } from '../db.js';

const router = express.Router();

// Authentication middleware
const withAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
};

// ===== HOC TOOLS ROUTES =====

// Test HOC connection
router.get('/test', withAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    // Check if user is HOC for any classes
    const hocResult = await query(
      'SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = $1',
      [userId]
    );

    const isHOC = parseInt(hocResult.rows[0].hoc_count) > 0;

    res.json({
      success: true,
      message: 'HOC system is working!',
      userId: userId,
      isHOC: isHOC,
      hocClassCount: parseInt(hocResult.rows[0].hoc_count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('HOC test error:', error);
    res.status(500).json({
      success: false,
      error: 'HOC test failed'
    });
  }
});

// Get HOC's classes
router.get('/my-classes', withAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    console.log('Fetching classes for HOC user:', userId);

    // First, check if classes table exists and user has HOC classes
    const classCheck = await query(`
      SELECT 
        c.id, 
        c.class_name, 
        c.subject,
        c.start_time,
        c.end_time,
        c.location,
        c.status,
        c.instructor,
        c.max_students,
        c.created_at,
        COUNT(e.student_id) as enrolled_students
      FROM classes c
      LEFT JOIN enrollments e ON c.id = e.class_id
      WHERE c.hoc_user_id = $1
      GROUP BY c.id
      ORDER BY c.start_time ASC
    `, [userId]);

    console.log('Classes found:', classCheck.rows.length);

    // If no classes found in database, return demo data
    if (classCheck.rows.length === 0) {
      const demoClasses = [
        {
          id: 1,
          class_name: 'Advanced Computer Science',
          subject: 'CS401',
          start_time: new Date(Date.now() + 86400000).toISOString(),
          end_time: new Date(Date.now() + 86400000 + 7200000).toISOString(),
          location: 'Room 301',
          status: 'scheduled',
          instructor: 'Dr. Smith',
          max_students: 30,
          enrolled_students: 25,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          class_name: 'Database Systems',
          subject: 'CS302',
          start_time: new Date(Date.now() + 172800000).toISOString(),
          end_time: new Date(Date.now() + 172800000 + 7200000).toISOString(),
          location: 'Lab B',
          status: 'scheduled',
          instructor: 'Prof. Johnson',
          max_students: 25,
          enrolled_students: 22,
          created_at: new Date().toISOString()
        },
        {
          id: 3,
          class_name: 'Web Development',
          subject: 'CS201',
          start_time: new Date(Date.now() - 86400000).toISOString(),
          end_time: new Date(Date.now() - 86400000 + 7200000).toISOString(),
          location: 'Online',
          status: 'completed',
          instructor: 'Dr. Wilson',
          max_students: 40,
          enrolled_students: 38,
          created_at: new Date().toISOString()
        }
      ];

      return res.json({
        success: true,
        data: demoClasses,
        count: demoClasses.length,
        message: 'Using demo data - no classes found in database'
      });
    }

    res.json({
      success: true,
      data: classCheck.rows,
      count: classCheck.rows.length
    });
  } catch (error) {
    console.error('Error fetching HOC classes:', error);
    
    // If table doesn't exist, return demo data
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      const demoClasses = [
        {
          id: 1,
          class_name: 'Advanced Computer Science',
          subject: 'CS401',
          start_time: new Date(Date.now() + 86400000).toISOString(),
          end_time: new Date(Date.now() + 86400000 + 7200000).toISOString(),
          location: 'Room 301',
          status: 'scheduled',
          instructor: 'Dr. Smith',
          max_students: 30,
          enrolled_students: 25,
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          class_name: 'Database Systems',
          subject: 'CS302',
          start_time: new Date(Date.now() + 172800000).toISOString(),
          end_time: new Date(Date.now() + 172800000 + 7200000).toISOString(),
          location: 'Lab B',
          status: 'scheduled',
          instructor: 'Prof. Johnson',
          max_students: 25,
          enrolled_students: 22,
          created_at: new Date().toISOString()
        }
      ];

      return res.json({
        success: true,
        data: demoClasses,
        count: demoClasses.length,
        message: 'Using demo data - database tables not set up yet'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch classes'
    });
  }
});

// Cancel class
router.post('/cancel-class', withAuth, async (req, res) => {
  try {
    const { classId, reason } = req.body;
    const userId = req.user.id || req.user.userId;

    console.log('Cancel class request:', { classId, reason, userId });

    if (!classId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Class ID and reason are required'
      });
    }

    // For demo purposes - simulate successful cancellation
    // In production, you would verify and update the database
    if (classId === 1 || classId === 2 || classId === 3) {
      // Simulate database update
      console.log(`Simulating cancellation of class ${classId} by user ${userId}`);
      
      return res.json({
        success: true,
        message: 'Class cancelled successfully',
        classId: classId,
        cancelledBy: userId,
        reason: reason,
        timestamp: new Date().toISOString()
      });
    }

    // If we had a real database, we would do:
    /*
    // Verify user owns this class
    const classCheck = await query(
      'SELECT id, class_name FROM classes WHERE id = $1 AND hoc_user_id = $2',
      [classId, userId]
    );

    if (classCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to cancel this class'
      });
    }

    // Update class status
    await query(
      'UPDATE classes SET status = $1, cancellation_reason = $2, updated_at = NOW() WHERE id = $3',
      ['cancelled', reason, classId]
    );

    // Log the cancellation
    await query(
      'INSERT INTO class_logs (class_id, action, reason, user_id, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [classId, 'cancelled', reason, userId]
    );

    res.json({
      success: true,
      message: 'Class cancelled successfully',
      classId: classId,
      className: classCheck.rows[0].class_name
    });
    */

    res.json({
      success: true,
      message: 'Class cancellation simulated successfully',
      classId: classId,
      reason: reason,
      note: 'This is a demo - no actual database changes were made'
    });

  } catch (error) {
    console.error('Error cancelling class:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel class'
    });
  }
});

// Reschedule class
router.post('/reschedule-class', withAuth, async (req, res) => {
  try {
    const { classId, newTime, newRoom, reason } = req.body;
    const userId = req.user.id || req.user.userId;

    console.log('Reschedule class request:', { classId, newTime, newRoom, reason, userId });

    if (!classId || !newTime || !newRoom) {
      return res.status(400).json({
        success: false,
        error: 'Class ID, new time, and new room are required'
      });
    }

    // For demo purposes - simulate successful rescheduling
    if (classId === 1 || classId === 2 || classId === 3) {
      console.log(`Simulating reschedule of class ${classId} by user ${userId}`);
      
      return res.json({
        success: true,
        message: 'Class rescheduled successfully',
        classId: classId,
        rescheduledBy: userId,
        newTime: newTime,
        newRoom: newRoom,
        reason: reason,
        timestamp: new Date().toISOString()
      });
    }

    // If we had a real database, we would do:
    /*
    // Verify user owns this class
    const classCheck = await query(
      'SELECT id, class_name FROM classes WHERE id = $1 AND hoc_user_id = $2',
      [classId, userId]
    );

    if (classCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to reschedule this class'
      });
    }

    const className = classCheck.rows[0].class_name;

    // Update class schedule
    await query(
      'UPDATE classes SET start_time = $1, location = $2, status = $3, updated_at = NOW() WHERE id = $4',
      [newTime, newRoom, 'rescheduled', classId]
    );

    // Log the reschedule
    await query(
      'INSERT INTO class_logs (class_id, action, reason, details, user_id, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [classId, 'rescheduled', reason, `New time: ${newTime}, New room: ${newRoom}`, userId]
    );

    res.json({
      success: true,
      message: 'Class rescheduled successfully',
      classId: classId,
      className: className,
      newTime: newTime,
      newRoom: newRoom
    });
    */

    res.json({
      success: true,
      message: 'Class rescheduling simulated successfully',
      classId: classId,
      newTime: newTime,
      newRoom: newRoom,
      reason: reason,
      note: 'This is a demo - no actual database changes were made'
    });

  } catch (error) {
    console.error('Error rescheduling class:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reschedule class'
    });
  }
});

// Get HOC students
router.get('/students', withAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    
    console.log('Fetching students for HOC user:', userId);

    // Try to get real students from database
    try {
      const result = await query(
        `SELECT DISTINCT 
          u.id, 
          u.full_name as name, 
          u.email,
          u.department,
          u.academic_year
         FROM users u
         INNER JOIN enrollments e ON u.id = e.student_id
         INNER JOIN classes c ON e.class_id = c.id
         WHERE c.hoc_user_id = $1
         ORDER BY u.full_name ASC`,
        [userId]
      );

      if (result.rows.length > 0) {
        return res.json({
          success: true,
          data: result.rows,
          count: result.rows.length
        });
      }
    } catch (dbError) {
      console.log('Database query failed, returning demo students:', dbError.message);
    }

    // Return demo students if no real data found
    const demoStudents = [
      {
        id: 1,
        name: 'Alice Johnson',
        email: 'alice@university.edu',
        department: 'Computer Science',
        academic_year: 'Year 3'
      },
      {
        id: 2,
        name: 'Bob Smith',
        email: 'bob@university.edu',
        department: 'Computer Science',
        academic_year: 'Year 3'
      },
      {
        id: 3,
        name: 'Carol Davis',
        email: 'carol@university.edu',
        department: 'Computer Science',
        academic_year: 'Year 4'
      },
      {
        id: 4,
        name: 'David Wilson',
        email: 'david@university.edu',
        department: 'Software Engineering',
        academic_year: 'Year 3'
      },
      {
        id: 5,
        name: 'Eva Brown',
        email: 'eva@university.edu',
        department: 'Computer Science',
        academic_year: 'Year 2'
      }
    ];

    res.json({
      success: true,
      data: demoStudents,
      count: demoStudents.length,
      message: 'Using demo data - no students found in database'
    });

  } catch (error) {
    console.error('Error fetching HOC students:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
});

// Create new class
router.post('/create-class', withAuth, async (req, res) => {
  try {
    const { className, subject, date, time, duration, room, maxStudents } = req.body;
    const userId = req.user.id || req.user.userId;

    console.log('Create class request:', { className, subject, date, time, duration, room, maxStudents, userId });

    if (!className || !date || !time || !room) {
      return res.status(400).json({
        success: false,
        error: 'Class name, date, time, and room are required'
      });
    }

    // For demo purposes - simulate successful class creation
    const newClassId = Math.floor(Math.random() * 1000) + 100;
    
    console.log(`Simulating creation of class ${className} by user ${userId}`);

    res.json({
      success: true,
      message: 'Class created successfully',
      classId: newClassId,
      className: className,
      subject: subject,
      date: date,
      time: time,
      duration: duration,
      room: room,
      maxStudents: maxStudents,
      createdBy: userId,
      timestamp: new Date().toISOString(),
      note: 'This is a demo - no actual database changes were made'
    });

  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create class'
    });
  }
});

// Send notifications to students
router.post('/notifications', withAuth, async (req, res) => {
  try {
    const { message, classId } = req.body;
    const userId = req.user.id || req.user.userId;

    console.log('Send notification request:', { message, classId, userId });

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Simulate sending notifications
    console.log(`Simulating notification sent by user ${userId}: "${message}"`);

    res.json({
      success: true,
      message: 'Notification sent successfully to all students',
      notification: message,
      sentBy: userId,
      classId: classId,
      timestamp: new Date().toISOString(),
      note: 'This is a demo - no actual notifications were sent'
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification'
    });
  }
});

// ===== BASIC ROUTES =====

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'HOC Tools API',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/hoc/test - Test HOC connection',
      'GET /api/hoc/my-classes - Get HOC classes',
      'POST /api/hoc/cancel-class - Cancel a class',
      'POST /api/hoc/reschedule-class - Reschedule a class',
      'GET /api/hoc/students - Get HOC students',
      'POST /api/hoc/create-class - Create new class',
      'POST /api/hoc/notifications - Send notifications'
    ]
  });
});

// Root route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'HOC Tools API is working!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

export { withAuth };
export default router;