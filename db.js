// db.js
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// Export the pool directly
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: true } : false, // Enforce SSL in production
  connectionTimeoutMillis: isProduction ? 5000 : 10000,
  idleTimeoutMillis: isProduction ? 10000 : 30000,
  max: isProduction ? 10 : 5,
});

// Add error listener for idle clients
pool.on('error', (err, client) => {
  console.error('Database Pool Error: Unexpected error on idle client', err);
});

// Export the connection test function
export const connectWithRetry = async (retries = 5, delay = 5000) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const client = await pool.connect();
      console.log(`Database connected successfully on attempt ${attempt + 1}.`);
      await client.query('SELECT NOW()'); // Test query
      client.release(); // Release client back to pool
      return; // Success
    } catch (err) {
      attempt++;
      console.error(`Database connection attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        console.log(`Retrying connection in ${delay / 1000} seconds...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error('FATAL: Max database connection retries reached.');
        throw new Error('Failed to connect to the database.');
      }
    }
  }
};

// Export a convenience query function
export const query = (text, params) => pool.query(text, params);

// Export all components as a default object
export default {
    pool,
    query,
    connectWithRetry
};