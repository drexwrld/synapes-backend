import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes imports - make sure these file names match exactly
import authRoutes from './routes/auth.js';
import homepageRoutes from './routes/homepage.js';
import hocRoutes from 'backend/routes/HOC.js'; // Make sure this file exists

import { initializeDatabase } from './db.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for now
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
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
    environment: NODE_ENV
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
  console.error('🚨 Unhandled Error:', err);
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong!',
    ...(NODE_ENV === 'development' && { details: err.message })
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('🟡 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;