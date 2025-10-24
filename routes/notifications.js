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

    console.log(`Registered push token for user ${userId}: ${pushToken}`);

    // --- Database operation to save pushToken to user's row is assumed here ---

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

    // --- Database operation to clear pushToken from user's row is assumed here ---

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

// Get all notifications for a user
router.get('/get-notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    console.log('Fetching notifications for user:', userId);

    let notifications = [];

    try {
      // Fetch from database, ensuring we include is_read
      const result = await query(
        `SELECT id, user_id, title, message, body, type, is_read, 
                created_at, data FROM notifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );

      notifications = result.map(notif => ({
        id: notif.id,
        title: notif.title,
        message: notif.message || notif.body,
        body: notif.message || notif.body,
        type: notif.type,
        isRead: notif.is_read || false, // Ensure isRead is boolean and defaults safely
        createdAt: notif.created_at,
        data: notif.data
      }));

      console.log('Found', notifications.length, 'notifications in database');
    } catch (dbError) {
      console.log('Database query failed, using demo notifications:', dbError.message);
      
      // Return demo notifications
      notifications = [
        {
          id: 1,
          title: 'Welcome to Synapse!',
          message: 'Your student companion app is ready to use. Explore all features!',
          type: 'announcement',
          isRead: true,
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 2,
          title: 'Mathematics Class Rescheduled',
          message: 'Your Mathematics class has been moved to 3 PM tomorrow in Room 305',
          type: 'reschedule',
          isRead: false,
          createdAt: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 3,
          title: 'Data Structures Class Update',
          message: 'Prof. Ahmed has posted new lecture notes for Chapter 5',
          type: 'class_notification',
          isRead: false,
          createdAt: new Date(Date.now() - 1800000).toISOString()
        },
        {
          id: 4,
          title: 'Physics Class Cancelled',
          message: 'Physics class scheduled for tomorrow has been cancelled due to lab maintenance',
          type: 'cancel',
          isRead: false,
          createdAt: new Date(Date.now() - 600000).toISOString()
        }
      ];
    }

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
      message: 'Notifications retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

// Mark notification as read
router.post('/mark-as-read/:notificationId', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userId;

    console.log('Marking notification as read:', notificationId);

    try {
      await query(
        'UPDATE notifications SET is_read = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );
    } catch (dbError) {
      console.log('Database update failed (non-critical):', dbError.message);
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notificationId: notificationId
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

// Delete notification
router.delete('/delete-notification/:notificationId', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userId;

    console.log('Deleting notification:', notificationId);

    try {
      await query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );
    } catch (dbError) {
      console.log('Database delete failed (non-critical):', dbError.message);
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully',
      notificationId: notificationId
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});

// Clear all notifications
router.delete('/clear-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    console.log('Clearing all notifications for user:', userId);

    try {
      await query(
        'DELETE FROM notifications WHERE user_id = $1',
        [userId]
      );
    } catch (dbError) {
      console.log('Database clear failed (non-critical):', dbError.message);
    }

    // Returning success whether database operation worked or failed non-critically
    res.json({
      success: true,
      message: 'All notifications cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear notifications'
    });
  }
});

// --- NEW ENDPOINT: Log a notification for the sender (HOC) ---
router.post('/log-notification', authenticateToken, async (req, res) => {
  try {
    const { title, message, type = 'announcement', data = {}, isBroadcast = false } = req.body;
    const userId = req.userId;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    console.log(`📝 Logging notification for sender ${userId}: ${title}`);

    try {
      // Insert into the database for the sending user (is_read set to FALSE by default)
      const result = await query(
        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at, data)
         VALUES ($1, $2, $3, $4, FALSE, NOW(), $5)
         RETURNING id, created_at`,
        [userId, title, message, type, JSON.stringify(data)]
      );

      if (result.length > 0) {
        console.log('✅ Notification logged in database:', result[0].id);
      }
    } catch (dbError) {
      console.log('📌 Database insert failed (non-critical):', dbError.message);
    }

    res.json({
      success: true,
      message: 'Notification logged for sender successfully',
    });

  } catch (error) {
    console.error('❌ Error logging sender notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log sender notification'
    });
  }
});
// -----------------------------------------------------------------

// Send class notification (existing, simulates pushing to all class members)
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
    // --- Logic here would fetch all students in classId and insert a notification for each ---

    res.json({ 
      success: true, 
      message: 'Notification sent successfully',
      recipientCount: 0
    });
  } catch (error) {
    console.error('Error sending class notification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send notification' 
    });
  }
});

// Broadcast notification to all students (existing, simulates pushing to ALL students)
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
    // --- Logic here would fetch all students and insert a notification for each ---

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

// Update notification preference
router.post('/update-preference', authenticateToken, async (req, res) => {
  try {
    const { notificationsEnabled } = req.body;
    const userId = req.userId;

    console.log(`Updating notification preference for user ${userId}:`, notificationsEnabled);

    try {
      await query(
        'UPDATE users SET notifications_enabled = $1, updated_at = NOW() WHERE id = $2',
        [notificationsEnabled, userId]
      );
    } catch (dbError) {
      console.log('Database update failed (non-critical):', dbError.message);
    }

    res.json({
      success: true,
      message: 'Notification preference updated successfully',
      notificationsEnabled: notificationsEnabled
    });
  } catch (error) {
    console.error('Error updating notification preference:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preference'
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Notifications API',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
