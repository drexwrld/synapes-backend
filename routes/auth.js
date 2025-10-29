// routes/auth.js
import express from 'express';
import { pool } from '../db.js';
import { hashPassword, comparePassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', asyncHandler(async (req, res) => {
    const { fullName, email, password, department, academicYear } = req.body;

    // Validation
    if (!fullName || !email || !password || !department || !academicYear) {
        return sendError(res, 'All fields are required.', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
         return sendError(res, 'Invalid email format.', 400);
    }
    if (password.length < 6) {
        return sendError(res, 'Password must be at least 6 characters.', 400);
    }

    const lowerCaseEmail = email.toLowerCase();
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [lowerCaseEmail]);
    if (existingUser.rows.length > 0) {
        return sendError(res, 'An account with this email already exists.', 409);
    }

    const hashedPassword = await hashPassword(password);

    const insertQuery = `
        INSERT INTO users (full_name, email, password_hash, department, academic_year, is_hoc, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id`;
    const values = [fullName, lowerCaseEmail, hashedPassword, department, academicYear, false];
    
    await pool.query(insertQuery, values);

    sendSuccess(res, { message: "Account created successfully. Please log in." }, 201);
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return sendError(res, 'Email and password are required.', 400);
    }

    const lowerCaseEmail = email.toLowerCase();
    const userQuery = `
        SELECT id, email, password_hash, full_name as "fullName", department,
               academic_year as "academicYear", is_hoc as "isHoc"
        FROM users WHERE email = $1`;
    const userResult = await pool.query(userQuery, [lowerCaseEmail]);

    if (userResult.rows.length === 0) {
        return sendError(res, 'Invalid email or password.', 401);
    }
    const user = userResult.rows[0];

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
        return sendError(res, 'Invalid email or password.', 401);
    }

    const token = generateToken(user.id);
    const userDataToSend = {
        id: user.id, fullName: user.fullName, email: user.email,
        department: user.department, academicYear: user.academicYear, isHoc: user.isHoc
    };

    sendSuccess(res, { token, user: userDataToSend });
}));

export default router; // Use export default for the router