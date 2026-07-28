import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

export function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function signPurposeToken(userId, purpose, expiresIn) {
  return jwt.sign({ sub: userId, purpose }, SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
