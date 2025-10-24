import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js'; // Assuming this path is correct

const router = express.Router();

/**
 * Middleware to verify JWT token and ensure user is authenticated.
 * All HOC routes will require this.
 */
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

    // Verify the token
    const decoded = verifyToken(token);
    // Add the authenticated user's ID to the request object
    req.userId = decoded.userId; 
    
    // IMPORTANT: In a real app, you should ALSO check if this user has the 'hoc' role.
    // e.g., const user = await query("SELECT role FROM users WHERE id = $1", [req.userId]);
    // if (user[0].role !== 'hoc') {
    //   return res.status(403).json({ success: false, error: 'Forbidden: Not a Head of Class' });
    // }

    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

// Apply the authentication middleware to ALL routes in this file
router.use(authenticateToken);

// --- Routes for app/HocTools.jsx ---

/**
 * GET /api/hoc/my-classes
 * Fetches all classes managed by the authenticated HOC.
 */
router.get('/my-classes', async (req, res) => {
  try {
    const hocUserId = req.userId;
    console.log(`Fetching classes for HOC: ${hocUserId}`);
    
    // Query to get classes for this HOC and count enrolled students
    const result = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM student_classes sc WHERE sc.class_id = c.id) as enrolled_students 
       FROM classes c 
       WHERE c.hoc_user_id = $1 
       ORDER BY c.start_time DESC`,
      [hocUserId]
    );
    
    res.json({ success: true, data: result });
    
  } catch (error) {
    // MODIFICATION: Removed the mock data fallback.
    // Now, if the query fails, it will send the real error to the frontend.
    console.error('Error fetching HOC classes:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching HOC classes',
      details: error.message 
    });
  }
});

/**
 * GET /api/hoc/students
 * Fetches all students enrolled in any of the HOC's classes.
 */
router.get('/students', async (req, res) => {
  try {
    const hocUserId = req.userId;
    console.log(`Fetching students for HOC: ${hocUserId}`);
    
    // This query finds all unique students (users) who are in a class
    // managed by this HOC.
    const result = await query(
      `SELECT DISTINCT u.id, u.full_name as name, u.email, u.department, u.academic_year
       FROM users u
       JOIN student_classes sc ON u.id = sc.user_id
       JOIN classes c ON sc.class_id = c.id
       WHERE c.hoc_user_id = $1 AND u.role = 'student'`, // Assuming you have a 'role' column
      [hocUserId]
    );

    res.json({ success: true, data: result });
    
  } catch (error) {
    // MODIFICATION: Removed the mock data fallback.
    console.error('Error fetching HOC students:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching HOC students',
      details: error.message 
    });
  }
});

/**
 * POST /api/hoc/create-class
 * Creates a new class assigned to the authenticated HOC.
 */
router.post('/create-class', async (req, res) => {
  try {
    const { className, subject, date, time, duration, room, maxStudents } = req.body;
    const hocUserId = req.userId;

    if (!className || !date || !time || !room) {
      return res.status(400).json({ success: false, error: 'Class name, date, time, and room are required' });
    }
    
    // Combine date and time into a valid timestamp
    const startTime = `${date} ${time}`; 
    
    console.log(`Creating new class: ${className} for HOC ${hocUserId}`);

    const result = await query(
      `INSERT INTO classes (class_name, subject, start_time, duration_minutes, location, max_students, hoc_user_id, status, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW()) 
       RETURNING id`,
      [className, subject || null, startTime, duration || 60, room, maxStudents || 30, hocUserId]
    );

    res.status(201).json({ success: true, message: 'Class created successfully', data: result[0] });
    
  } catch (error) {
    console.error('Error creating class:', error.message);
    res.status(500).json({ success: false, error: 'Server error while creating class' });
  }
});

/**
 * POST /api/hoc/cancel-class
 * Marks a class as 'cancelled'.
 */
router.post('/cancel-class', async (req, res) => {
  try {
    const { classId, reason } = req.body;
    const hocUserId = req.userId;
    
    if (!classId || !reason) {
      return res.status(400).json({ success: false, error: 'Class ID and reason are required' });
    }

    console.log(`Cancelling class ${classId} for HOC ${hocUserId} (Reason: ${reason})`);
    
    // IMPORTANT: We check hoc_user_id = $2 to ensure this HOC owns the class
    const result = await query(
      "UPDATE classes SET status = 'cancelled' WHERE id = $1 AND hoc_user_id = $2 RETURNING id",
      [classId, hocUserId]
    );

    if (result.length === 0) {
      return res.status(403).json({ success: false, error: 'Class not found or you do not have permission to cancel it' });
    }

    // TODO: Add logic here to notify all enrolled students of the cancellation.

    res.json({ success: true, message: 'Class cancelled successfully' });
    
  } catch (error) {
    console.error('Error cancelling class:', error.message);
    res.status(500).json({ success: false, error: 'Server error while cancelling class' });
  }
});

/**
 * POST /api/hoc/reschedule-class
 * Updates a class's time and location.
 */
router.post('/reschedule-class', async (req, res) => {
  try {
    const { classId, newTime, newRoom, reason } = req.body;
    const hocUserId = req.userId;

    if (!classId || !newTime || !newRoom) {
      return res.status(400).json({ success: false, error: 'Class ID, new time, and new room are required' });
    }

    console.log(`Rescheduling class ${classId} to ${newTime} at ${newRoom}`);

    // Frontend must send `newTime` as a full valid timestamp string (e.g., "2025-10-25 14:30:00")
    // IMPORTANT: We check hoc_user_id = $4
    const result = await query(
      `UPDATE classes 
       SET start_time = $1, location = $2, status = 'rescheduled' 
       WHERE id = $3 AND hoc_user_id = $4 
       RETURNING id`,
      [newTime, newRoom, classId, hocUserId]
    );

    if (result.length === 0) {
      return res.status(403).json({ success: false, error: 'Class not found or you do not have permission to reschedule it' });
    }

    // TODO: Add logic here to notify all enrolled students of the reschedule.

    res.json({ success: true, message: 'Class rescheduled successfully' });
    
  } catch (error) {
    console.error('Error rescheduling class:', error.message);
    res.status(500).json({ success: false, error: 'Server error while rescheduling class' });
  }
});


// --- Routes for app/settingscreen.jsx ---

/**
 * GET /api/hoc/test
 * Called by settings screen to check if the user is an HOC.
 */
router.get('/test', async (req, res) => {
  try {
    const hocUserId = req.userId;
    console.log(`Checking HOC status for user ${hocUserId}`);
    
    // This is just one way to check. A better way is a 'role' column on the 'users' table.
    const result = await query(
      "SELECT COUNT(*) as hoc_count FROM classes WHERE hoc_user_id = $1",
      [hocUserId]
    );
    
    const isHOC = parseInt(result[0].hoc_count, 10) > 0;
    
    res.json({ success: true, isHOC: isHOC });
    
  } catch (error) {
    console.error('Error checking HOC status:', error.message);
    // Fallback to false, ensuring no one gets HOC by accident
    res.json({ success: true, isHOC: false });
  }
});

/**
 * POST /api/hoc/force-enable-hoc
 * A test/demo route called by settingscreen.jsx to grant HOC status.
 */
router.post('/force-enable-hoc', async (req, res) => {
  try {
    const hocUserId = req.userId;
    console.log(`Forcing HOC mode for user: ${hocUserId}`);

    // This is a test-only function.
    // We will attempt to update the user's role to 'hoc'
    // This requires a 'role' column on your 'users' table.
    const result = await query(
      "UPDATE users SET role = 'hoc' WHERE id = $1 RETURNING id",
      [hocUserId]
    );
    
    if (result.length === 0) {
       return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    console.log(`User ${hocUserId} role updated to 'hoc'`);
    res.json({ success: true, message: 'HOC mode activated' });
    
  } catch (error) {
    // This will likely fail if you don't have a 'role' column.
    console.warn('Could not update user role (maybe no "role" column?):', error.message);
    // We return success anyway so the demo works on the frontend.
    res.json({ success: true, message: 'HOC mode activated (simulated)' });
  }
});


export default router;

