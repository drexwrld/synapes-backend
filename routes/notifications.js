// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const db = require('../db');

// Store push token for user
router.post('/register-token', async (req, res) => {
  try {
    const { userId, pushToken } = req.body;
    
    await db.query(
      'INSERT INTO user_push_tokens (user_id, push_token, created_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET push_token = $2, updated_at = $3',
      [userId, pushToken, new Date()]
    );

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('Error registering push token:', error);
    res.status(500).json({ success: false, error: 'Failed to register push token' });
  }
});

// Send notification to class students
router.post('/send-class-notification', async (req, res) => {
  try {
    const { classId, message, title = 'Class Notification' } = req.body;
    
    // Get all students in the class with their push tokens
    const students = await db.query(`
      SELECT u.id, u.name, u.email, upt.push_token 
      FROM class_enrollments ce
      JOIN users u ON ce.student_id = u.id
      LEFT JOIN user_push_tokens upt ON u.id = upt.user_id
      WHERE ce.class_id = $1 AND upt.push_token IS NOT NULL
    `, [classId]);

    const pushTokens = students.rows.map(student => student.push_token);
    
    if (pushTokens.length > 0) {
      await notificationService.sendBulkNotifications(pushTokens, {
        title,
        body: message
      }, {
        type: 'class_notification',
        classId: classId
      });
    }

    res.json({ 
      success: true, 
      message: `Notification sent to ${pushTokens.length} students` 
    });
  } catch (error) {
    console.error('Error sending class notification:', error);
    res.status(500).json({ success: false, error: 'Failed to send notification' });
  }
});

module.exports = router;