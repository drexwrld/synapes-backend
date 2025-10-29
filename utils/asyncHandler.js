// utils/asyncHandler.js

/**
 * Wraps an async function route handler to catch errors and pass them to next().
 * @param {Function} fn - The async route handler function (req, res, next) => Promise<void>
 * @returns {Function} - An Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next); // Pass any errors to the global error handler
};

module.exports = asyncHandler;