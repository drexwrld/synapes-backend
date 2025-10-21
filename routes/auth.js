import express from "express";
import { getDB } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { createToken } from "../utils/jwt.js";

const router = express.Router();

async function executeQuery(query, params = []) {
  try {
    const db = await getDB();
    const [result] = await db.execute(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error('Database operation failed: ' + error.message);
  }
}

// TEST ENDPOINT - Add this first
router.get("/test", async (req, res) => {
  try {
    console.log('🧪 Testing complete system...');
    
    // Test 1: Environment variables
    console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('🗄️  DATABASE_HOST:', process.env.DATABASE_HOST);
    
    // Test 2: Database connection
    const db = await getDB();
    console.log('✅ Database connected');
    
    // Test 3: Query users table
    const [users] = await db.execute('SELECT COUNT(*) as count FROM users');
    console.log('📊 Users in database:', users[0].count);
    
    // Test 4: Check table structure
    const [tableInfo] = await db.execute('DESCRIBE users');
    console.log('📋 Users table columns:', tableInfo.map(col => col.Field));
    
    res.json({ 
      success: true, 
      message: 'System test passed',
      usersCount: users[0].count,
      tableColumns: tableInfo.map(col => col.Field)
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
    const existing = await executeQuery("SELECT id FROM users WHERE email = ?", [email]);
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
    const result = await executeQuery(
      "INSERT INTO users (full_name, email, password_hash, department, academic_year, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [fullName, email, password_hash, department, academicYear]
    );
    console.log('✅ User created with ID:', result.insertId);

    const userRows = await executeQuery(
      "SELECT id, full_name, email, department, academic_year, created_at FROM users WHERE id = ?",
      [result.insertId]
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

    // Test database connection first
    console.log('🔌 3. Testing database connection...');
    const db = await getDB();
    console.log('✅ 4. Database connected');

    console.log('🔍 5. Querying user...');
    const rows = await executeQuery("SELECT * FROM users WHERE email = ?", [email]);
    console.log('📊 6. Found users:', rows.length);

    if (rows.length === 0) {
      console.log('❌ 7. No user found with email:', email);
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    console.log('🔐 8. Verifying password...');
    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    console.log('✅ 9. Password valid:', valid);

    if (!valid) {
      console.log('❌ 10. Password verification failed');
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    console.log('🎫 11. Creating token...');
    const token = createToken(user);
    console.log('✅ 12. Token created successfully');

    console.log('🎉 13. Login successful for user:', user.email);

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