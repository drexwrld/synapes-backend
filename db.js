// db.js
const { Pool } = require('pg');
require('dotenv').config(); // Ensure environment variables are loaded

// Validate DATABASE_URL existence
if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1); // Exit if DB URL is missing
}

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enforce SSL/TLS in production, allow flexibility in development/testing
  ssl: isProduction ? { rejectUnauthorized: true } : false,
  // Sensible defaults, adjust based on expected load
  connectionTimeoutMillis: isProduction ? 5000 : 10000, // 5s in prod, 10s dev
  idleTimeoutMillis: isProduction ? 10000 : 30000, // 10s in prod, 30s dev
  max: isProduction ? 10 : 5, // Fewer connections in dev potentially
});

// Listener for errors on idle clients in the pool
pool.on('error', (err, client) => {
  console.error('Database Pool Error: Unexpected error on idle client', err);
  // Consider more sophisticated error handling like attempting to remove the faulty client
  // For critical errors, you might want to alert or even gracefully shutdown.
});

// Function to test the database connection with retry logic
const connectWithRetry = async (retries = 5, delay = 5000) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const client = await pool.connect();
      console.log(`Database connected successfully on attempt ${attempt + 1}`);
      // Optional: Perform a simple query to ensure readiness
      await client.query('SELECT NOW()');
      client.release(); // IMPORTANT: Release the client back to the pool
      return; // Connection successful
    } catch (err) {
      attempt++;
      console.error(`Database connection attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        console.log(`Retrying connection in ${delay / 1000} seconds...`);
        // Wait before the next retry
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error('FATAL: Maximum database connection retries reached. Could not connect.');
        // Throw the error to be handled by the server startup logic
        throw new Error('Failed to connect to the database after multiple retries.');
      }
    }
  }
};

module.exports = {
  pool, // Export the pool itself for direct use if needed
  query: (text, params) => pool.query(text, params), // Convenience query function
  connectWithRetry // Export the connection test function
};