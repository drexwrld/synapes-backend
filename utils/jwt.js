import jwt from "jsonwebtoken";

export function createToken(user) {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    if (!user || !user.id || !user.email) {
      throw new Error('Invalid user data for token creation');
    }
    
    const payload = {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
    };

    console.log('🔑 Creating token for user:', user.email);
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
    console.log('✅ Token created successfully');
    
    return token;
  } catch (error) {
    console.error('❌ JWT Token creation error:', error.message);
    throw new Error('Failed to create authentication token: ' + error.message);
  }
}

export function verifyToken(token) {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('❌ JWT verification error:', error.message);
    throw error;
  }
}