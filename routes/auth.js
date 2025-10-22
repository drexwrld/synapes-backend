import express from "express";
import { query } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { createToken } from "../utils/jwt.js";

const router = express.Router();

// TEST ENDPOINT - Add this first
router.get("/test", async (req, res) => {
  try {
    console.log('🧪 Testing complete system...');
    
    // Test 1: Environment variables
    console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('🗄️  DATABASE_HOST:', process.env.DATABASE_HOST);
    
    // Test 2: Database connection
    const testResult = await query('SELECT 1 + 1 AS solution');
    console.log('✅ Database connected, test query result:', testResult[0].solution);
    
    // Test 3: Query users table
    const users = await query('SELECT COUNT(*) as count FROM users');
    console.log('📊 Users in database:', users[0].count);
    
    // Test 4: Check table structure
    const tableInfo = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log('📋 Users table columns:', tableInfo.map(col => col.column_name));
    
    res.json({ 
      success: true, 
      message: 'System test passed',
      usersCount: users[0].count,
      tableColumns: tableInfo.map(col => col.column_name)
    });
    
  } catch (error) {
    console.error('❌ System test failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

router.post("/signup", async (req, res) => {
  try {
    console.log('📥 Signup request received:', { ...req.body, password: '[HIDDEN]' });
    
    const { fullName, email, password, department, academicYear } = req.body;

    if (!fullName || !email || !password || !department || !academicYear) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required." 
      });
    }

    console.log('🔍 Checking for existing user...');
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Email already registered." 
      });
    }

    console.log('🔐 Hashing password...');
    const password_hash = await hashPassword(password);
    console.log('✅ Password hashed');

    console.log('💾 Creating user in database...');
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, department, academic_year, created_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [fullName, email, password_hash, department, academicYear]
    );
    console.log('✅ User created with ID:', result[0].id);

    const userRows = await query(
      "SELECT id, full_name, email, department, academic_year, created_at FROM users WHERE id = $1",
      [result[0].id]
    );

    const user = userRows[0];
    console.log('🎫 Creating JWT token...');
    const token = createToken(user);
    console.log('✅ Token created');

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        department: user.department,
        academicYear: user.academic_year,
        createdAt: user.created_at
      },
      token,
    });
  } catch (err) {
    console.error("❌ Signup error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ 
      success: false, 
      error: "Server error during registration: " + err.message
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    console.log('🔍 1. Login endpoint hit', { ...req.body, password: '[HIDDEN]' });
    
    const { email, password } = req.body;
    console.log('📧 2. Email:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required."
      });
    }

    console.log('🔍 3. Querying user...');
    const rows = await query("SELECT * FROM users WHERE email = $1", [email]);
    console.log('📊 4. Found users:', rows.length);

    if (rows.length === 0) {
      console.log('❌ 5. No user found with email:', email);
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    console.log('🔐 6. Verifying password...');
    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    console.log('✅ 7. Password valid:', valid);

    if (!valid) {
      console.log('❌ 8. Password verification failed');
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    console.log('🎫 9. Creating token...');
    const token = createToken(user);
    console.log('✅ 10. Token created successfully');

    console.log('🎉 11. Login successful for user:', user.email);

    res.json({
      success: true,
      message: "Login successful!",
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        department: user.department,
        academicYear: user.academic_year,
        createdAt: user.created_at,
      },
      token,
    });
    
  } catch (err) {
    console.error("💥 LOGIN ERROR:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ 
      success: false, 
      error: "Server error during login: " + err.message
    });
  }
});

export default router;