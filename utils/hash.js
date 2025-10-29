// utils/hash.js
import bcrypt from 'bcryptjs'; // Use import

/**
 * Hashes a plain text password.
 */
export const hashPassword = async (password) => {
    if (!password) {
        throw new Error('Password cannot be empty');
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        return hashedPassword;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw new Error('Password hashing failed.');
    }
};

/**
 * Compares a plain text password with a hashed password.
 */
export const comparePassword = async (enteredPassword, hashedPassword) => {
    if (!enteredPassword || !hashedPassword) {
        return false;
    }
    try {
        return await bcrypt.compare(enteredPassword, hashedPassword);
    } catch (error) {
        console.error("Error comparing passwords:", error);
        return false; // Return false on error
    }
};