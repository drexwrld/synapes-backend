import jwt from "jsonwebtoken";

export function createToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}
