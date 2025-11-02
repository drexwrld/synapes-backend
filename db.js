// db.js - Rewritten for PostgreSQL with proper error handling
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

// ========== DATABASE CONNECTION CONFIGURATION ==========

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL ERROR: DATABASE_URL environment variable is not set.');
  console.error('Please add DATABASE_URL to your .env file');
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // ALWAYS use SSL for Render
  connectionTimeoutMillis: isProduction ? 5000 : 10000,
  idleTimeoutMillis: isProduction ? 10000 : 30000,
  max: isProduction ? 20 : 5, // Max connections in pool
  application_name: 'synapse_backend',
});

// ========== CONNECTION EVENT HANDLERS ==========

pool.on('connect', () => {
  console.log('✅ New database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client in pool:', err.message);
  process.exit(-1);
});

pool.on('remove', () => {
  console.log('⚠️ Database connection removed from pool');
});

// ========== CONNECTION RETRY LOGIC ==========

/**
 * Test database connection with retry logic
 * @param {number} retries - Number of retry attempts (default: 5)
 * @param {number} delay - Delay between retries in milliseconds (default: 5000)
 * @returns {Promise<void>}
 */
export const connectWithRetry = async (retries = 5, delay = 5000) => {
  let attempt = 0;

  while (attempt < retries) {
    try {
      attempt++;
      console.log(`🔄 Database connection attempt ${attempt}/${retries}...`);

      // Test the connection
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');

      console.log(`✅ Database connected successfully on attempt ${attempt}`);
      console.log(`⏰ Database server time: ${result.rows[0].now}`);

      client.release();
      return; // Success
    } catch (err) {
      console.error(`❌ Connection attempt ${attempt} failed: ${err.message}`);

      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error('❌ FATAL: Max database connection retries reached.');
        throw new Error(
          `Failed to connect to database after ${retries} attempts. ` +
          `Last error: ${err.message}`
        );
      }
    }
  }
};

// ========== QUERY HELPERS ==========

/**
 * Execute a SQL query
 * @param {string} text - SQL query string with $1, $2, etc. for parameters
 * @param {Array} params - Query parameters
 * @returns {Promise<object>} - Query result from PostgreSQL
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`⚠️ Slow query (${duration}ms): ${text.substring(0, 50)}...`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Query error:', error.message);
    console.error('Query:', text.substring(0, 100));
    throw error;
  }
};

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Function that receives client and executes queries
 * @returns {Promise<any>} - Result from callback
 */
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction error:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a single row from query results
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<object|null>} - First row or null if no results
 */
export const queryOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

/**
 * Get all rows from query results
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Array of rows
 */
export const queryAll = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

/**
 * Get a raw pool client for advanced operations
 * IMPORTANT: Must call client.release() when done
 * @returns {Promise<object>} - PostgreSQL client
 */
export const getClient = async () => {
  return await pool.connect();
};

// ========== CONNECTION CLEANUP ==========

/**
 * Close all database connections gracefully
 * Call this when shutting down the server
 * @returns {Promise<void>}
 */
export const closePool = async () => {
  try {
    console.log('🔌 Closing database connection pool...');
    await pool.end();
    console.log('✅ Database connection pool closed successfully');
  } catch (error) {
    console.error('❌ Error closing database pool:', error.message);
    throw error;
  }
};

// ========== POOL STATUS & DIAGNOSTICS ==========

/**
 * Get pool diagnostics information
 * @returns {object} - Pool status information
 */
export const getPoolStatus = () => {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
  };
};

/**
 * Log pool status to console
 */
export const logPoolStatus = () => {
  const status = getPoolStatus();
  console.log('📊 Database Pool Status:', status);
};

// ========== EXPORT DEFAULT OBJECT ==========

export default {
  pool,
  query,
  queryOne,
  queryAll,
  transaction,
  getClient,
  connectWithRetry,
  closePool,
  getPoolStatus,
  logPoolStatus,
};