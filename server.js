// server.js - Updated to use improved db.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './db.js';

// Import middleware
import { protect, hocOnly } from './middleware/authMiddleware.js';
import { sendError } from './utils/responceHandler.js';

// Import routes
import authRoutes from './routes/auth.js';
import homeRoutes from './routes/homepage.js';
import hocRoutes from './routes/HOC.js';
import notificationRoutes from './routes/notifications.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Parse CORS origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:8081',
      'http://localhost:19006',
      'http://localhost:3000'
    ];

console.log(`📍 Allowed CORS Origins: ${allowedOrigins.join(', ')}`);

// --- CORS Middleware ---
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));
app.options('*', cors());

// --- Body Parser Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Request Logging Middleware ---
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path}`);
  next();
});

// --- API Routes ---
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Synapse Backend API is operational',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const poolStatus = db.getPoolStatus();
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    uptime: process.uptime(),
    database: poolStatus,
    timestamp: new Date().toISOString()
  });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes (require valid JWT)
app.use('/api/home', protect, homeRoutes);
app.use('/api/notifications', protect, notificationRoutes);

// HOC routes (require valid JWT + HOC privileges)
app.use('/api/hoc', protect, hocOnly, hocRoutes);

// --- Not Found Handler ---
app.use((req, res) => {
  sendError(res, `Resource not found: ${req.method} ${req.originalUrl}`, 404);
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('🔴 Global Error Handler');
  console.error('Error Message:', err.message);
  if (NODE_ENV !== 'production') {
    console.error('Stack Trace:', err.stack);
  }

  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal Server Error';
  let errorCode = err.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorMessage = 'Authentication failed. Please log in again.';
    errorCode = 'AUTH_ERROR';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    errorMessage = 'This item already exists.';
    errorCode = 'DUPLICATE_ENTRY';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorMessage = 'Service temporarily unavailable.';
    errorCode = 'SERVICE_UNAVAILABLE';
  } else if (err.message === 'Not allowed by CORS policy') {
    statusCode = 403;
    errorMessage = 'Access denied due to CORS policy.';
    errorCode = 'CORS_ERROR';
  }

  // Ensure valid status code
  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  sendError(res, errorMessage, statusCode, errorCode);
});

// --- Start Server Function ---
async function startServer() {
  try {
    // Test database connection
    console.log('🔌 Connecting to database...');
    await db.connectWithRetry();
    console.log('✅ Database connection successful');

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════╗
║   🚀 Synapse Backend Server        ║
║   Port: ${PORT}                       ║
║   Environment: ${NODE_ENV}              ║
║   Status: ✅ RUNNING                ║
╚════════════════════════════════════╝
      `);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`\n📛 ${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        console.log('✅ Server closed');
        
        // Close database connection
        try {
          await db.closePool();
        } catch (error) {
          console.error('Error closing database pool:', error);
        }
        
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error('🔴 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('🔴 Unhandled Rejection at:', promise);
      console.error('Reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('🔴 FATAL: Server startup failed');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();