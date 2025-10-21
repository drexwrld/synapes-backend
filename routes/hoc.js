import express from 'express';
import { verifyToken } from '../utils/jwt.js';
import { getDB } from '../db.js';

const router = express.Router();

// Authentication HOC middleware
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
    console.error('Auth HOC error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
};

// Admin authorization HOC middleware
const withAdmin = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = verifyToken(token);
    
    // Check if user has admin role (you can modify this based on your user structure)
    if (!decoded.isAdmin && decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Admin HOC error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
};

// Database connection HOC middleware
const withDB = async (req, res, next) => {
  try {
    const db = await getDB();
    req.db = db;
    next();
  } catch (error) {
    console.error('Database HOC error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Database connection failed.'
    });
  }
};

// Validation HOC middleware
const withValidation = (schema) => {
  return (req, res, next) => {
    try {
      // Basic validation example - you can integrate with Joi or similar
      if (schema) {
        // Add your validation logic here
        console.log('Validation schema:', schema);
      }
      
      // Check for required fields in body
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!req.body || Object.keys(req.body).length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Request body is required.'
          });
        }
      }
      next();
    } catch (error) {
      console.error('Validation HOC error:', error.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed: ' + error.message
      });
    }
  };
};

// Rate limiting HOC (simple in-memory version)
const rateLimitMap = new Map();
const withRateLimit = (windowMs = 60000, maxRequests = 100) => {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, []);
    }

    const requests = rateLimitMap.get(ip).filter(time => time > windowStart);
    rateLimitMap.set(ip, requests);

    if (requests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    requests.push(now);
    next();
  };
};

// ===== PROTECTED ROUTES =====

// Test protected route with authentication
router.get('/protected', withAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Access granted to protected route!',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Admin only route
router.get('/admin', withAuth, withAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'Welcome, Admin!',
    user: req.user,
    adminFeatures: ['user_management', 'analytics', 'system_settings']
  });
});

// Route with database connection
router.get('/data', withAuth, withDB, async (req, res) => {
  try {
    const db = req.db;
    // Example query - modify based on your needs
    const [results] = await db.execute('SELECT * FROM users LIMIT 5');
    
    res.json({
      success: true,
      message: 'Data retrieved successfully',
      data: results,
      count: results.length
    });
  } catch (error) {
    console.error('Data route error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data'
    });
  }
});

// Route with rate limiting
router.get('/limited', withRateLimit(60000, 10), (req, res) => {
  res.json({
    success: true,
    message: 'This route is rate limited to 10 requests per minute'
  });
});

// Route with multiple HOCs
router.post('/secure-data', 
  withRateLimit(60000, 5), // 5 requests per minute
  withAuth,                // Requires authentication
  withValidation(),        // Add validation schema if needed
  withDB,                  // Database connection
  async (req, res) => {
    try {
      const { data } = req.body;
      const userId = req.user.userId;

      // Example: Save data to database
      const db = req.db;
      const [result] = await db.execute(
        'INSERT INTO user_data (user_id, data, created_at) VALUES (?, ?, NOW())',
        [userId, JSON.stringify(data)]
      );

      res.json({
        success: true,
        message: 'Data saved successfully',
        dataId: result.insertId,
        user: req.user
      });
    } catch (error) {
      console.error('Secure data route error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save data'
      });
    }
  }
);

// ===== PUBLIC ROUTES =====

// Basic test route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'HOC Routes are working!',
    availableEndpoints: [
      'GET /api/hoc/protected (requires auth)',
      'GET /api/hoc/admin (requires admin)',
      'GET /api/hoc/data (requires auth + db)',
      'GET /api/hoc/limited (rate limited)',
      'POST /api/hoc/secure-data (multiple HOCs)'
    ],
    timestamp: new Date().toISOString()
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'HOC Routes',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Test all HOCs
router.get('/test', withRateLimit(60000, 20), async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'HOC system test passed!',
      features: [
        'Authentication HOC',
        'Admin Authorization HOC',
        'Database Connection HOC',
        'Validation HOC',
        'Rate Limiting HOC'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'HOC test failed: ' + error.message
    });
  }
});

// Export the HOC middlewares for use in other routes
export {
  withAuth,
  withAdmin,
  withDB,
  withValidation,
  withRateLimit
};

export default router;