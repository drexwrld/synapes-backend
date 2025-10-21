import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import homepageRoutes from './routes/homepage.js';
import hocRoutes from './routes/HOC.js';
import { initializeDatabase } from './db.js'; // FIXED PATH

dotenv.config();

// Initialize database
initializeDatabase();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/home', homepageRoutes);
app.use('/api/hoc', hocRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Synapse Backend API', 
    version: '1.0.0',
    status: 'running'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
});