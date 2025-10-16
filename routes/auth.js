import express from "express";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/hash.js";
import { createToken } from "../utils/jwt.js";

const router = express.Router();

// ✅ Register
router.post("/signup", async (req, res) => {
  try {
    const { fullName, email, password, department, academicYear } = req.body;

    if (!fullName || !email || !password || !department || !academicYear)
      return res.status(400).json({ success: false, error: "All fields required." });

    // Check if user exists
    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0)
      return res.status(400).json({ success: false, error: "Email already registered." });

    // Hash password
    const password_hash = await hashPassword(password);

    // Save user
    const [result] = await db.query(
      "INSERT INTO users (full_name, email, password_hash, department, academic_year, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [fullName, email, password_hash, department, academicYear]
    );

    const [userRows] = await db.query(
      "SELECT id, full_name, email, department, academic_year, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    const user = userRows[0];
    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      user,
      token,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, error: "Server error." });
  }
});

// 🔐 Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0)
      return res.status(401).json({ success: false, error: "Invalid email or password." });

    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);

    if (!valid)
      return res.status(401).json({ success: false, error: "Invalid email or password." });

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
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Server error." });
  }
});

export default router;
