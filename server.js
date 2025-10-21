import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';

// Routes imports - make sure these file names match exactly
import authRoutes from './routes/auth.js';
import homepageRoutes from './routes/homepage.js';
import hocRoutes from './routes/HOC.js'; // Fixed: lowercase to match common naming

import { initializeDatabase } from './db.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || true
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// Logging middleware
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint (should come before other routes)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Synapse Backend API',
    version: '1.0.0',
    status: 'running',
    environment: NODE_ENV,
    documentation: '/api/docs'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/home', homepageRoutes);
app.use('/api/hoc', hocRoutes);

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: ['/api/auth', '/api/home', '/api/hoc', '/health']
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Unhandled Error:', err.stack);
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong!',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('🛑 Received shutdown signal, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed.');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('🟡 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 Base URL: http://localhost:${PORT}/`);
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
const server = startServer();

export default app;