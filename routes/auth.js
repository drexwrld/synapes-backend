// REPLACE your current auth.js with this:
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
    throw new Error('Database operation failed');
  }
}

router.post("/signup", async (req, res) => {
  try {
    console.log('📥 Signup request received:', req.body);
    
    const { fullName, email, password, department, academicYear } = req.body;

    if (!fullName || !email || !password || !department || !academicYear) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required." 
      });
    }

    const existing = await executeQuery("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Email already registered." 
      });
    }

    const password_hash = await hashPassword(password);

    const result = await executeQuery(
      "INSERT INTO users (full_name, email, password_hash, department, academic_year, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [fullName, email, password_hash, department, academicYear]
    );

    const userRows = await executeQuery(
      "SELECT id, full_name, email, department, academic_year, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    const user = userRows[0];
    const token = createToken(user);

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
      error: "Server error during registration."
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const rows = await executeQuery("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password." 
      });
    }

    const token = createToken(user);

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
      error: "Server error during login."
    });
  }
});

export default router;