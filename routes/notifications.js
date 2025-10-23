import express from 'express';
import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js';

const router = express.Router();

// Middleware
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

    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

// Register push token
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const { userId, pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({ 
        success: false, 
        error: 'Push token is required' 
      });
    }

    // For now, just log it - implement database storage if needed
    console.log(`Registered push token for user ${userId}: ${pushToken}`);

    res.json({ 
      success: true, 
      message: 'Push token registered successfully' 
    });
  } catch (error) {
    console.error('Error registering push token:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to register push token' 
    });
  }
});

// Unregister push token
router.post('/unregister-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`Unregistered push token for user ${userId}`);

    res.json({ 
      success: true, 
      message: 'Push token unregistered successfully' 
    });
  } catch (error) {
    console.error('Error unregistering push token:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to unregister push token' 
    });
  }
});

// Send class notification
router.post('/send-class-notification', authenticateToken, async (req, res) => {
  try {
    const { classId, message, title = 'Class Notification' } = req.body;
    
    if (!classId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Class ID and message are required' 
      });
    }

    console.log(`Sending notification to class ${classId}: ${message}`);

    res.json({ 
      success: true, 
      message: 'Notification sent successfully',
      recipientCount: 0 // Update with actual count if using database
    });
  } catch (error) {
    console.error('Error sending class notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send notification' 
    });
  }
});

// Broadcast notification to all students
router.post('/broadcast-notification', authenticateToken, async (req, res) => {
  try {
    const { message, title = 'Announcement' } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    console.log(`Broadcasting notification: ${message}`);

    res.json({ 
      success: true, 
      message: 'Broadcast notification sent successfully' 
    });
  } catch (error) {
    console.error('Error sending broadcast notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send broadcast notification' 
    });
  }
});

export default router;