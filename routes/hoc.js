import express from 'express';
import { query } from '../db.js';
import { authenticateToken } from './homepage.js';

const router = express.Router();

// Get all classes for HOC
router.get('/my-classes', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    const classes = await query(
      `SELECT * FROM classes 
       WHERE hoc_user_id = ? 
       ORDER BY start_time ASC`,
      [userId]
    );

    res.json({
      success: true,
      data: classes
    });
  } catch (error) {
    console.error('HOC classes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel a class
router.post('/cancel-class', authenticateToken, async (req, res) => {
  try {
    const { classId, reason } = req.body;
    const userId = req.userId;

    // Verify HOC owns this class
    const classResult = await query(
      'SELECT * FROM classes WHERE id = ? AND hoc_user_id = ?',
      [classId, userId]
    );

    if (classResult.length === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to cancel this class' 
      });
    }

    // Update class status
    await query(
      'UPDATE classes SET status = "cancelled" WHERE id = ?',
      [classId]
    );

    // Log the update
    await query(
      `INSERT INTO schedule_updates 
       (class_id, update_type, reason, created_by) 
       VALUES (?, 'cancelled', ?, ?)`,
      [classId, reason, userId]
    );

    res.json({
      success: true,
      message: 'Class cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel class error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reschedule a class
router.post('/reschedule-class', authenticateToken, async (req, res) => {
  try {
    const { classId, newTime, newRoom, reason } = req.body;
    const userId = req.userId;

    // Verify HOC owns this class
    const classResult = await query(
      'SELECT * FROM classes WHERE id = ? AND hoc_user_id = ?',
      [classId, userId]
    );

    if (classResult.length === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to reschedule this class' 
      });
    }

    const oldClass = classResult[0];

    // Update class
    await query(
      'UPDATE classes SET start_time = ?, location = ?, status = "rescheduled" WHERE id = ?',
      [newTime, newRoom, classId]
    );

    // Log the update
    await query(
      `INSERT INTO schedule_updates 
       (class_id, update_type, old_time, new_time, old_room, new_room, reason, created_by) 
       VALUES (?, 'rescheduled', ?, ?, ?, ?, ?, ?)`,
      [classId, oldClass.start_time, newTime, oldClass.location, newRoom, reason, userId]
    );

    res.json({
      success: true,
      message: 'Class rescheduled successfully'
    });
  } catch (error) {
    console.error('Reschedule class error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;