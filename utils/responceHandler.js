// utils/responseHandler.js

/**
 * Sends a standardized success response.
 * @param {object} res - Express response object.
 * @param {*} [data=null] - Optional data payload.
 * @param {number} [statusCode=200] - HTTP status code.
 */
const sendSuccess = (res, data = null, statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        data: data
    });
};

/**
 * Sends a standardized error response.
 * @param {object} res - Express response object.
 * @param {string} [message='An unexpected error occurred'] - Error message.
 * @param {number} [statusCode=500] - HTTP status code.
 */
const sendError = (res, message = 'An unexpected error occurred', statusCode = 500) => {
    console.error(`Error Response Sent (Status ${statusCode}): ${message}`); // Log errors server-side
    res.status(statusCode).json({
        success: false,
        error: message
    });
};

module.exports = { sendSuccess, sendError };