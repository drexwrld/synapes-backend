import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js'; // Assuming this path is correct

const router = express.Router();

// --- Middleware ---

/**
 * Middleware to verify JWT token and ensure user is authenticated.
 * Attaches req.userId to the request object.
 * Applies to all routes defined in this file.
 */
const authenticateToken = async (req, res, next) => {
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
    req.userId = decoded.userId; // Add userId to the request

    // --- IMPORTANT SECURITY NOTE ---
    // In a production app, you should also verify that this user *actually*
    // has the 'hoc' role by querying the database here.
    // Example:
    // const userResult = await query("SELECT role FROM users WHERE id = $1", [req.userId]);
    // if (!userResult || userResult.length === 0 || userResult[0].role !== 'hoc') {
    //   return res.status(403).json({ success: false, error: 'Forbidden: User is not a Head of Class' });
    // }
    // --- END SECURITY NOTE ---

    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    // Handle specific JWT errors if needed (e.g., TokenExpiredError)
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Apply authentication middleware to all subsequent routes in this router
router.use(authenticateToken);

// --- HOC Management Routes (for app/HocTools.jsx) ---

/**
 * GET /api/hoc/my-classes
 * Fetches all classes managed by the authenticated HOC, including student count.
 */
router.get('/my-classes', async (req, res) => {
  const hocUserId = req.userId; // Get user ID from middleware
  console.log(`Fetching classes for HOC: ${hocUserId}`);
  try {
    const result = await query(
      `SELECT
         c.*,
         (SELECT COUNT(*) FROM student_classes sc WHERE sc.class_id = c.id) as enrolled_students
       FROM classes c
       WHERE c.hoc_user_id = $1
       ORDER BY c.start_time DESC`,
      [hocUserId]
    );

    res.json({ success: true, data: result || [] }); // Ensure data is always an array

  } catch (error) {
    console.error('Error fetching HOC classes:', error); // Log the full error
    res.status(500).json({
      success: false,
      error: 'Database error while fetching classes.',
      details: error.message // Provide details for debugging
    });
  }
});

/**
 * GET /api/hoc/students
 * Fetches all unique students enrolled in any of the HOC's classes.
 */
router.get('/students', async (req, res) => {
  const hocUserId = req.userId;
  console.log(`Fetching students for HOC: ${hocUserId}`);
  try {
    // Query joins users, student_classes, and classes to find students
    // linked to classes managed by this HOC. Assumes users.role exists.
    const result = await query(
      `SELECT DISTINCT
         u.id, u.full_name as name, u.email, u.department, u.academic_year
       FROM users u
       JOIN student_classes sc ON u.id = sc.user_id
       JOIN classes c ON sc.class_id = c.id
       WHERE c.hoc_user_id = $1 AND u.role = 'student'`,
      [hocUserId]
    );

    res.json({ success: true, data: result || [] });

  } catch (error) {
    console.error('Error fetching HOC students:', error);
    res.status(500).json({
      success: false,
      error: 'Database error while fetching students.',
      details: error.message
    });
  }
});

/**
 * POST /api/hoc/create-class
 * Creates a new class assigned to the authenticated HOC.
 * Includes robust validation for required fields, date/time, and numbers.
 */
router.post('/create-class', async (req, res) => {
  const hocUserId = req.userId;
  try {
    const { className, subject, date, time, duration, room, maxStudents } = req.body;

    // 1. Validate required fields
    if (!className || !subject || !date || !time || !room) {
      return res.status(400).json({
        success: false,
        error: 'Class name, subject, date, time, and room/location are required.'
      });
    }

    // 2. Validate and parse date/time
    const combinedString = `${date} ${time}`;
    const startTimeObject = new Date(combinedString);
    if (isNaN(startTimeObject.getTime())) {
      console.error(`Invalid date format received: ${combinedString}`);
      return res.status(400).json({
        success: false,
        error: `Invalid date/time format. Please use YYYY-MM-DD and HH:MM (24-hour).`
      });
    }
    // Convert to ISO 8601 format for PostgreSQL TIMESTAMP WITH TIME ZONE
    const startTime = startTimeObject.toISOString();

    // 3. Validate and parse numbers (provide defaults)
    const durationInt = parseInt(duration, 10);
    const maxStudentsInt = parseInt(maxStudents, 10);
    const finalDuration = !isNaN(durationInt) && durationInt > 0 ? durationInt : 60; // Default 60 mins
    const finalMaxStudents = !isNaN(maxStudentsInt) && maxStudentsInt > 0 ? maxStudentsInt : 30; // Default 30 students

    console.log(`Attempting to create class: ${className} for HOC ${hocUserId}`);

    // 4. Execute INSERT query
    const result = await query(
      `INSERT INTO classes
         (class_name, subject, start_time, duration_minutes, location, max_students, hoc_user_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW())
       RETURNING id`,
      [className, subject, startTime, finalDuration, room, finalMaxStudents, hocUserId]
    );

    if (result.length === 0) {
      // This case should ideally not happen if INSERT doesn't throw an error, but good to have
      throw new Error('Class creation failed but did not return an ID.');
    }

    console.log(`✅ Class created successfully with ID: ${result[0].id}`);
    res.status(201).json({
      success: true,
      message: 'Class created successfully!',
      data: result[0] // Return the new class ID
    });

  } catch (error) {
    // Log the full error object for detailed diagnosis
    console.error('Error creating class:', error);

    // Provide more specific feedback based on common PostgreSQL error codes
    let userMessage = 'Server error while creating class.';
    if (error.code) { // Check if it's a PostgreSQL error object
      switch (error.code) {
        case '23502': // not_null_violation
          userMessage = `Database error: A required field (${error.column}) was missing or null.`;
          break;
        case '23503': // foreign_key_violation
          userMessage = 'Database error: Invalid reference ID (e.g., HOC user ID not found).';
          break;
        case '23505': // unique_violation
          userMessage = `Database error: This class conflicts with an existing one (unique constraint: ${error.constraint}).`;
          break;
        case '22P02': // invalid_text_representation (e.g., bad data type conversion)
          userMessage = 'Database error: Invalid data format for one of the fields.';
          break;
        case '22007': // invalid_datetime_format
          userMessage = 'Database error: Invalid date/time format encountered.';
          break;
        case '22008': // datetime_field_overflow
            userMessage = 'Database error: Date/time value is out of range.';
            break;
      }
    }

    res.status(500).json({
      success: false,
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined // Only show raw message in dev
    });
  }
});

/**
 * POST /api/hoc/cancel-class
 * Marks a specific class owned by the HOC as 'cancelled'.
 */
router.post('/cancel-class', async (req, res) => {
  const hocUserId = req.userId;
  try {
    const { classId, reason } = req.body;

    if (!classId || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Class ID and a non-empty reason are required.'
      });
    }

    console.log(`Attempting to cancel class ${classId} for HOC ${hocUserId} (Reason: ${reason})`);

    // Update status only if the class exists AND belongs to this HOC
    const result = await query(
      `UPDATE classes
       SET status = 'cancelled'
       WHERE id = $1 AND hoc_user_id = $2
       RETURNING id, class_name`, // Return name for logging
      [classId, hocUserId]
    );

    if (result.length === 0) {
      // Could be class not found, or user doesn't own it
      return res.status(403).json({
        success: false,
        error: 'Class not found or you do not have permission to cancel it.'
      });
    }

    console.log(`✅ Class "${result[0].class_name}" (ID: ${result[0].id}) cancelled successfully.`);

    // --- TODO: Implement Notification Logic ---
    // Here you would typically:
    // 1. Query `student_classes` to get all `user_id`s for this `classId`.
    // 2. Insert a notification row into the `notifications` table for each student.
    // 3. Potentially send push notifications if tokens are registered.
    // --- End Notification Logic ---

    res.json({ success: true, message: 'Class cancelled successfully.' });

  } catch (error) {
    console.error('Error cancelling class:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while cancelling class.',
      details: error.message
    });
  }
});

/**
 * POST /api/hoc/reschedule-class
 * Updates the start time and location for a specific class owned by the HOC.
 */
router.post('/reschedule-class', async (req, res) => {
  const hocUserId = req.userId;
  try {
    // Note: Frontend sends `newTime` as a combined "YYYY-MM-DD HH:MM" string
    const { classId, newTime, newRoom, reason } = req.body;

    if (!classId || !newTime || !newRoom) {
      return res.status(400).json({
        success: false,
        error: 'Class ID, new date/time (YYYY-MM-DD HH:MM), and new room/location are required.'
      });
    }

    // Validate and parse the combined date/time string
    const newStartTimeObject = new Date(newTime);
    if (isNaN(newStartTimeObject.getTime())) {
      console.error(`Invalid reschedule date format received: ${newTime}`);
      return res.status(400).json({
        success: false,
        error: `Invalid new date/time format. Please use YYYY-MM-DD HH:MM.`
      });
    }
    const newStartTime = newStartTimeObject.toISOString(); // Convert to ISO format

    console.log(`Attempting to reschedule class ${classId} to ${newStartTime} at ${newRoom}`);

    // Update time, location, and status if the class exists AND belongs to this HOC
    const result = await query(
      `UPDATE classes
       SET start_time = $1, location = $2, status = 'rescheduled'
       WHERE id = $3 AND hoc_user_id = $4
       RETURNING id, class_name`,
      [newStartTime, newRoom, classId, hocUserId]
    );

    if (result.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Class not found or you do not have permission to reschedule it.'
      });
    }

    console.log(`✅ Class "${result[0].class_name}" (ID: ${result[0].id}) rescheduled successfully.`);

    // --- TODO: Implement Notification Logic ---
    // Similar to cancel, notify enrolled students about the reschedule.
    // --- End Notification Logic ---

    res.json({ success: true, message: 'Class rescheduled successfully.' });

  } catch (error) {
    console.error('Error rescheduling class:', error);
    // Add specific checks for PostgreSQL error codes if needed (like invalid timestamp)
     let userMessage = 'Server error while rescheduling class.';
     if (error.code === '22007' || error.code === '22008') {
        userMessage = 'Database error: Invalid date/time format or value for reschedule.';
     }
    res.status(500).json({
      success: false,
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// --- HOC Status Check Routes (for app/settingscreen.jsx) ---

/**
 * GET /api/hoc/test
 * Simple check to see if the authenticated user manages any classes.
 * Used by settings screen to determine if HOC tools should be shown.
 */
router.get('/test', async (req, res) => {
  const hocUserId = req.userId;
  console.log(`Checking HOC status for user ${hocUserId}`);
  try {
    // Counts classes assigned to this user. A 'role' column check is generally better.
    const result = await query(
      "SELECT COUNT(*) as class_count FROM classes WHERE hoc_user_id = $1",
      [hocUserId]
    );

    // Ensure count is treated as a number
    const count = result[0]?.class_count ? parseInt(result[0].class_count, 10) : 0;
    const isHOC = count > 0;

    console.log(`User ${hocUserId} manages ${count} classes. isHOC: ${isHOC}`);
    res.json({ success: true, isHOC: isHOC });

  } catch (error) {
    // If the 'classes' table doesn't exist or query fails, assume not HOC.
    console.error('Error checking HOC status (database query failed):', error.message);
    res.json({ success: true, isHOC: false, error: 'Could not verify HOC status due to database error.' });
  }
});

/**
 * POST /api/hoc/force-enable-hoc
 * !!! TEST/DEMO ONLY !!!
 * Attempts to grant HOC status by updating the user's role in the database.
 * Requires a 'role' column on the 'users' table.
 */
router.post('/force-enable-hoc', async (req, res) => {
  const hocUserId = req.userId;
  console.log(`Attempting to force HOC mode for user: ${hocUserId}`);
  try {
    // --- THIS REQUIRES a 'role' TEXT column on your 'users' table ---
    const result = await query(
      "UPDATE users SET role = 'hoc' WHERE id = $1 RETURNING id",
      [hocUserId]
    );

    if (result.length === 0) {
       // Should not happen if user is authenticated, but check anyway
       return res.status(404).json({ success: false, error: 'Authenticated user not found in database.' });
    }

    console.log(`✅ User ${hocUserId} role forcefully updated to 'hoc'`);
    res.json({ success: true, message: 'HOC mode activated successfully (database updated).' });

  } catch (error) {
    // Log the error, likely due to missing 'role' column or permissions
    console.warn('Could not force-update user role (check if "role" column exists):', error.message);
    // Still return success for the demo frontend to proceed
    res.json({
        success: true, // Keep true for frontend demo logic
        message: 'HOC mode activation simulated (database update failed).',
        warning: 'Could not update user role in database. Check server logs and schema.'
    });
  }
});


export default router;

