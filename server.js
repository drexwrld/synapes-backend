// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables
const db = require('./db'); // Import database configuration

// Import middleware
const { protect, hocOnly } = require('./middleware/authMiddleware'); // Assuming middleware file is created
const { sendError } = require('./utils/responseHandler'); // Assuming response handler is created

// Import routes
const authRoutes = require('./routes/auth');
const homeRoutes = require('./routes/homepage');
const hocRoutes = require('./routes/HOC');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS Middleware ---
const allowedOrigins = [
    'http://localhost:8081', // Expo Go Metro Bundler Port
    'http://localhost:19006', // Expo Web Dev Server Port
    // Add your Expo Dev Client IP/Port if applicable (e.g., 'exp://192.168.1.100:8081')
    // Add your deployed frontend URL(s) for production builds
    // 'https://your-synapse-app-frontend.com'
];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            callback(new Error('Request from this origin is not allowed by CORS policy.'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
    credentials: true // Allow cookies/authorization headers if needed
}));
// Handle preflight requests across all routes
app.options('*', cors()); // Enables preflight requests


// --- Body Parser Middleware ---
// Parse incoming JSON request bodies
app.use(express.json({ limit: '10mb' })); // Adjust limit as needed
// Parse incoming URL-encoded request bodies (optional, if using forms)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// --- API Routes ---
// Basic health check/root route
app.get('/', (req, res) => {
    res.status(200).send('Synapse Backend API is operational.');
});

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Homepage routes (requires user to be logged in)
app.use('/api/home', protect, homeRoutes);

// Notification routes (requires user to be logged in)
app.use('/api/notifications', protect, notificationRoutes);

// Head of Class routes (requires user to be logged in AND be HOC)
app.use('/api/hoc', protect, hocOnly, hocRoutes);


// --- Not Found Handler ---
// Catch any requests that don't match the routes above
app.use((req, res, next) => {
  sendError(res, `Resource not found at ${req.originalUrl}`, 404);
});


// --- Global Error Handler ---
// This middleware catches all errors passed via next(err)
app.use((err, req, res, next) => {
  console.error("----- Global Error Handler Caught -----");
  console.error("Timestamp:", new Date().toISOString());
  console.error("Route:", req.method, req.originalUrl);
  console.error("Error Name:", err.name || 'UnknownError');
  console.error("Error Message:", err.message || 'An internal server error occurred.');
  // Log stack trace only in development for easier debugging
  if (process.env.NODE_ENV !== 'production') {
       console.error("Stack:", err.stack);
  }
  console.error("----- End Global Error -----");

  // Determine status code and user-friendly message
  let statusCode = err.statusCode || 500;
  let errorMessage = 'Internal Server Error'; // Default message

  // Customize responses based on known error types
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorMessage = 'Authentication error. Please log in again.';
  } else if (err.code === '23505') { // PostgreSQL unique violation (e.g., duplicate email)
    statusCode = 409; // Conflict
    errorMessage = 'Conflict: This item already exists.'; // Provide a less technical message
  } else if (err.code === 'ECONNREFUSED'){
    statusCode = 503; // Service Unavailable
    errorMessage = 'Service temporarily unavailable. Please try again later.'
  } else if (err.message === 'Not allowed by CORS') {
      statusCode = 403; // Forbidden
      errorMessage = 'Access denied due to security policy.';
  } else if (statusCode < 500) { // Keep client errors messages if defined
      errorMessage = err.message || 'Bad Request';
  }
  // Add more specific error code/name checks as needed

  // Ensure status code is a valid error code
  if (statusCode < 400 || statusCode > 599) {
      console.warn(`Invalid error statusCode ${statusCode} detected, resetting to 500.`);
      statusCode = 500;
  }

  // Use the standardized error response function
  sendError(res, errorMessage, statusCode);
});

// --- Start Server Function ---
// Encapsulate startup in an async function to await DB connection test
async function startServer() {
  try {
    // Test the database connection before starting the Express server
    await db.connectWithRetry(); // Use the function exported from db.js

    // Start listening for requests only after successful DB connection
    app.listen(PORT, () => {
      console.log(`Server running successfully in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  } catch (error) {
    // If connectWithRetry throws after exhausting retries
    console.error("FATAL: Server startup failed - Could not establish database connection:", error.message);
    process.exit(1); // Exit the process with an error code
  }
}

// Execute the server startup
startServer();