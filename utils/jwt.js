// utils/jwt.js
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Ensure environment variables are accessible

// --- Validate JWT_SECRET ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is not defined.');
    console.error('Please add JWT_SECRET=<your_strong_secret_key> to your .env file');
    process.exit(1); // Exit if secret is missing - critical for security
}

// --- Validate JWT_EXPIRES_IN ---
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'; // Default to 1 day if not set
// Optional: Add validation for the expiresIn format if needed


/**
 * Generates a JSON Web Token.
 * @param {string|number} userId - The ID of the user to include in the payload.
 * @returns {string} - The generated JWT.
 */
const generateToken = (userId) => {
    if (!userId) {
        console.error('Error generating token: userId is missing.');
        throw new Error('User identifier is required to generate a token.'); // Throw error if userId is missing
    }
    const payload = {
        userId: userId,
        // You could add other non-sensitive identifiers like role if useful, but keep it minimal
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
};

module.exports = { generateToken };