// routes/auth.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../utils/jwt');
const asyncHandler = require('../utils/asyncHandler'); // Import error wrapper
const { sendSuccess, sendError } = require('../utils/responseHandler'); // Import response helpers

// POST /api/auth/signup
router.post('/signup', asyncHandler(async (req, res) => {
    const { fullName, email, password, department, academicYear } = req.body;

    // --- Input Validation ---
    if (!fullName || !email || !password || !department || !academicYear) {
        return sendError(res, 'Missing required fields: fullName, email, password, department, and academicYear are required.', 400);
    }
    // Basic email format check (consider a more robust library like 'validator' for production)
    if (!/\S+@\S+\.\S+/.test(email)) {
         return sendError(res, 'Invalid email format.', 400);
    }
    if (typeof password !== 'string' || password.length < 6) {
        return sendError(res, 'Password must be a string of at least 6 characters.', 400);
    }
    // Add validation for department/academicYear if they should conform to specific values

    // --- Check for Existing User ---
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]); // Check lowercase email
    if (existingUser.rows.length > 0) {
        return sendError(res, 'An account with this email address already exists.', 409); // 409 Conflict
    }

    // --- Hash Password ---
    const hashedPassword = await hashPassword(password);

    // --- Create User ---
    // Ensure column names match your DB schema exactly (e.g., full_name, password_hash)
    const insertQuery = `
        INSERT INTO users (full_name, email, password_hash, department, academic_year, is_hoc, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id`; // Only return necessary fields, avoid returning hash
    const values = [
        fullName,
        email.toLowerCase(), // Store email in lowercase for consistency
        hashedPassword,
        department,
        academicYear,
        false // Default new users to not be HOC
    ];
    await pool.query(insertQuery, values);

    // Send success response
    sendSuccess(res, { message: "Account created successfully. You can now log in." }, 201); // 201 Created
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // --- Input Validation ---
    if (!email || !password) {
        return sendError(res, 'Please provide both email and password.', 400);
    }

    // --- Find User ---
    // Ensure column names match your DB schema
    const userQuery = `
        SELECT id, email, password_hash, full_name as "fullName", department,
               academic_year as "academicYear", is_hoc as "isHoc"
        FROM users
        WHERE email = $1`;
    const userResult = await pool.query(userQuery, [email.toLowerCase()]); // Check lowercase email

    if (userResult.rows.length === 0) {
        // Use a generic message for security (don't reveal if email exists)
        return sendError(res, 'Invalid email or password.', 401); // 401 Unauthorized
    }

    const user = userResult.rows[0];

    // --- Verify Password ---
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
        return sendError(res, 'Invalid email or password.', 401); // Password mismatch
    }

    // --- Generate Token ---
    const token = generateToken(user.id); // Payload contains userId

    // --- Prepare User Data for Response ---
    // Exclude sensitive information like password hash
    const userDataToSend = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        department: user.department,
        academicYear: user.academicYear,
        isHoc: user.isHoc
    };

    // --- Send Success Response ---
    sendSuccess(res, { token, user: userDataToSend });
}));

module.exports = router;