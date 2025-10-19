import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let db;
let isConnected = false;

async function createConnection() {
  console.log('🔌 Creating database connection...');
  
  const config = {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT || 3306,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  };

  console.log('📋 Connection config:', {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
  });

  try {
    const pool = mysql.createPool(config);
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    isConnected = true;
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    isConnected = false;
    throw error;
  }
}

export async function initializeDatabase() {
  try {
    db = await createConnection();
    console.log('✅ Database pool created');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    return false;
  }
}

export async function getDB() {
  if (!db) {
    await initializeDatabase();
  }
  return db;
}

export async function testConnection() {
  try {
    const pool = await getDB();
    if (!pool) throw new Error('Database pool not available');
    
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    return { success: true, message: 'Database connected' };
  } catch (error) {
    console.error('Connection test error:', error.message);
    return { success: false, error: error.message };
  }
}

export { db };