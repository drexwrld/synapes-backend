// utils/responseHandler.js

/**
 * Sends a standardized success JSON response.
 */
export const sendSuccess = (res, data = null, statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        data: data
    });
};

/**
 * Sends a standardized error JSON response and logs it.
 */
export const sendError = (res, message = 'An unexpected error occurred', statusCode = 500) => {
    console.error(`Error Response Sent (Status ${statusCode}): ${message}`);
    res.status(statusCode).json({
        success: false,
        error: message
    });
};