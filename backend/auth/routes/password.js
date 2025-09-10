// backend/auth/passwords.js
// Unified password helpers. Supports argon2 and bcryptjs. Chooses via ENV or hash prefix.
let argon2 = null;
let bcrypt = null;
try { argon2 = require('argon2'); } catch {}
try { bcrypt = require('bcryptjs'); } catch {}

const ALGO = String(process.env.PASSWORD_HASH_ALGO || '').toLowerCase(); // 'argon2' | 'bcrypt' | ''

const hasArgon = (h) => typeof h === 'string' && h.startsWith('$argon2');
const hasBcrypt = (h) => typeof h === 'string' && h.startsWith('$2');

async function hashPassword(plain) {
  if (!plain) throw new Error('hashPassword: missing plain password');
  if (ALGO === 'bcrypt') {
    if (!bcrypt) throw new Error('bcryptjs not installed');
    return bcrypt.hash(plain, 12);
  }
  if (ALGO === 'argon2') {
    if (!argon2) throw new Error('argon2 not installed');
    return argon2.hash(plain);
  }
  if (argon2) return argon2.hash(plain);
  if (bcrypt) return bcrypt.hash(plain, 12);
  throw new Error('No hashing library available. Install argon2 or bcryptjs.');
}

async function verifyPassword(plain, hashed) {
  if (!plain || !hashed) return false;
  if (hasArgon(hashed) && argon2) { try { return await argon2.verify(hashed, plain); } catch {} }
  if (hasBcrypt(hashed) && bcrypt) { try { return await bcrypt.compare(plain, hashed); } catch {} }
  if (argon2)  { try { if (await argon2.verify(hashed, plain))  return true; } catch {} }
  if (bcrypt)  { try { if (await bcrypt.compare(plain, hashed)) return true; } catch {} }
  return false;
}

module.exports = { hashPassword, verifyPassword };
