// db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,   // 👈 ensures "railway" is selected
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  ssl: {
    rejectUnauthorized: false,     // Needed for Railway
  },
  waitForConnections: true,
  connectionLimit: 10,
});

try {
  // This will confirm the database context
  const [rows] = await db.query("SELECT DATABASE() AS db_name;");
  console.log(`✅ Connected to MySQL database: ${rows[0].db_name}`);
} catch (err) {
  console.error("❌ Database connection failed!");
  console.error("Error message:", err.message);
}
