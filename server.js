// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './db.js'; // Use .js extension for local file imports in ESM

// Import middleware (we will create these new files)
import { protect, hocOnly } from './middleware/authMiddleware.js';
import { sendError } from './utils/responceHandler.js';

// Import routes
import authRoutes from './routes/auth.js';
import homeRoutes from './routes/homepage.js';
import hocRoutes from './routes/HOC.js';
import notificationRoutes from './routes/notifications.js';

// Load environment variables immediately
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS Middleware ---
const allowedOrigins = [
    'http://localhost:8081', // Expo Go Metro Bundler
    'http://localhost:19006', // Expo Web Dev Server
    // Add any other origins you need, like your Expo Dev Client IP
    // 'exp://192.168.1.10:8081' 
    // Add your deployed frontend URL when you have one
];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl) or from allowed origins
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            callback(new Error('Request from this origin is not allowed by CORS policy.'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.options('*', cors()); // Enable preflight requests

// --- Body Parser Middleware ---
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// --- API Routes ---
app.get('/', (req, res) => { // Basic health check
    res.status(200).send('Synapse Backend API is operational.');
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes (require valid JWT)
app.use('/api/home', protect, homeRoutes);
app.use('/api/notifications', protect, notificationRoutes);

// HOC routes (require valid JWT + HOC privileges)
app.use('/api/hoc', protect, hocOnly, hocRoutes);

// --- Not Found Handler ---
// This catches all requests that don't match a route above
app.use((req, res, next) => {
  sendError(res, `Resource not found at ${req.method} ${req.originalUrl}`, 404);
});

// --- Global Error Handler ---
// This MUST be the last middleware
app.use((err, req, res, next) => {
  console.error("----- Global Error Handler -----");
  console.error("Error:", err.message);
  if (process.env.NODE_ENV !== 'production') {
       console.error("Stack:", err.stack);
  }
  console.error("----- End Global Error -----");

  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal Server Error';

  // Handle specific known error types
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorMessage = 'Authentication error. Please log in again.';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409; // Conflict
    errorMessage = 'Conflict: This item already exists.';
  } else if (err.code === 'ECONNREFUSED'){
    statusCode = 503; // Service Unavailable
    errorMessage = 'Service temporarily unavailable. Please try again later.'
  } else if (err.message === 'Not allowed by CORS') {
      statusCode = 403; // Forbidden
      errorMessage = 'Access denied due to security policy.';
  } else if (statusCode < 500) { // Keep client error messages
      errorMessage = err.message;
  }

  // Ensure status code is a valid error code
  if (statusCode < 400 || statusCode > 599) {
      statusCode = 500;
  }

  sendError(res, errorMessage, statusCode);
});

// --- Start Server Function ---
async function startServer() {
  try {
    // Test database connection before starting
    await db.connectWithRetry();
    app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  } catch (error) {
    console.error("FATAL: Server startup failed - Could not connect to database:", error.message);
    process.exit(1); // Exit process if DB connection fails
  }
}

// Start the server
startServer();