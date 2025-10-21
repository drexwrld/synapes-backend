import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import homepageRoutes from './routes/homepage.js';
import hocRoutes from 'backend/routes/hoc.js'; // ADD THIS LINE
import { initializeDatabase } from './db.js';

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
app.use('/api/hoc', hocRoutes); // ADD THIS LINE

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});