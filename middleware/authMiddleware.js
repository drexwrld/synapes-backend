// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { sendError } from '../utils/responseHandler.js';
import dotenv from 'dotenv';

dotenv.config();

export const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const userResult = await pool.query(
        'SELECT id, email, full_name as "fullName", department, academic_year as "academicYear", is_hoc as "isHoc" FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return sendError(res, 'Not authorized, user not found.', 401);
      }

      req.user = userResult.rows[0];
      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      if (error.name === 'JsonWebTokenError') {
        return sendError(res, 'Not authorized, token failed.', 401);
      }
      if (error.name === 'TokenExpiredError') {
        return sendError(res, 'Not authorized, token expired.', 401);
      }
      return sendError(res, 'Not authorized, token invalid.', 401);
    }
  }

  if (!token) {
    return sendError(res, 'Not authorized, no token provided.', 401);
  }
};

export const hocOnly = (req, res, next) => {
    if (req.user && req.user.isHoc === true) {
        next();
    } else {
        return sendError(res, 'Forbidden: Head of Class privileges required.', 403);
    }
};