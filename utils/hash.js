// utils/hash.js
const bcrypt = require('bcryptjs'); // Use bcryptjs as listed in package-lock

/**
 * Hashes a plain text password.
 * @param {string} password - The plain text password.
 * @returns {Promise<string>} - A promise that resolves with the hashed password.
 */
const hashPassword = async (password) => {
    if (!password) {
        throw new Error('Password cannot be empty');
    }
    try {
        const salt = await bcrypt.genSalt(10); // Generate salt with 10 rounds (standard)
        const hashedPassword = await bcrypt.hash(password, salt);
        return hashedPassword;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw new Error('Password hashing failed.'); // Throw a generic error
    }
};

/**
 * Compares a plain text password with a hashed password.
 * @param {string} enteredPassword - The plain text password entered by the user.
 * @param {string} hashedPassword - The stored hashed password from the database.
 * @returns {Promise<boolean>} - A promise that resolves with true if passwords match, false otherwise.
 */
const comparePassword = async (enteredPassword, hashedPassword) => {
    // Check for null/undefined inputs to prevent bcrypt errors
    if (!enteredPassword || !hashedPassword) {
        return false;
    }
    try {
        // bcrypt.compare handles null bytes and timing attacks
        return await bcrypt.compare(enteredPassword, hashedPassword);
    } catch (error) {
        // Log the error but return false for security (don't reveal internal errors)
        console.error("Error comparing passwords:", error);
        return false;
    }
};

module.exports = { hashPassword, comparePassword };