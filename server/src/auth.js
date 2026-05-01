import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Production deploys MUST set JWT_SECRET — refuse to start without it
// rather than silently using the dev fallback (which would invalidate
// every token on each fresh deploy and is also obviously insecure).
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production.');
}
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-prod';
const TOKEN_TTL = '30d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
