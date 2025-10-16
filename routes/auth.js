import express from "express";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { createToken } from "../utils/jwt.js";

const router = express.Router();

// ✅ Register
router.post("/signup", async (req, res) => {
  try {
    console.log('📥 Signup request received:', req.body);
    
    const { fullName, email, password, department, academicYear } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !department || !academicYear) {
      console.log('❌ Missing fields:', { fullName, email, password, department, academicYear });
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required." 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address."
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long."
      });
    }

    console.log('🔍 Checking if user exists...');
    
    // Check if user exists
    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      console.log('❌ Email already registered:', email);
      return res.status(400).json({ 
        success: false, 
        error: "Email already registered." 
      });
    }

    console.log('🔐 Hashing password...');
    
    // Hash password
    const password_hash = await hashPassword(password);

    console.log('💾 Saving user to database...');
    
    // Save user
    const [result] = await db.query(
      "INSERT INTO users (full_name, email, password_hash, department, academic_year, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [fullName, email, password_hash, department, academicYear]
    );

    console.log('✅ User saved with ID:', result.insertId);

    // Get the created user (excluding password)
    const [userRows] = await db.query(
      "SELECT id, full_name, email, department, academic_year, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    const user = userRows[0];
    const token = createToken(user);

    console.log('🎉 Registration successful for:', email);

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
    console.error("❌ Signup error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error during registration.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔐 Login
router.post("/login", async (req, res) => {
  try {
    console.log('📥 Login request received:', { email: req.body.email });
    
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required."
      });
    }

    console.log('🔍 Checking user in database...');
    
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    const user = rows[0];
    console.log('🔐 Verifying password...');

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    const token = createToken(user);

    console.log('✅ Login successful for:', email);

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
    console.error("❌ Login error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error during login.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Health check for auth routes
router.get("/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Auth routes are working",
    timestamp: new Date().toISOString()
  });
});

export default router;