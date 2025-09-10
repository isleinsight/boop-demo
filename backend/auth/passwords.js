// backend/auth/passwords.js
// Unified password helpers. Supports argon2 and bcryptjs. Chooses via ENV or hash prefix.
let argon2 = null;
let bcrypt = null;

try { argon2 = require('argon2'); } catch {}
try { bcrypt = require('bcryptjs'); } catch {}

const ALGO = String(process.env.PASSWORD_HASH_ALGO || '').toLowerCase(); // 'argon2' | 'bcrypt' | ''

function hasArgonPrefix(hash) { return typeof hash === 'string' && hash.startsWith('$argon2'); }
function hasBcryptPrefix(hash){ return typeof hash === 'string' && hash.startsWith('$2'); }

async function hashPassword(plain) {
  if (!plain) throw new Error('hashPassword: missing plain password');
  // 1) Respect explicit env choice
  if (ALGO === 'bcrypt') {
    if (!bcrypt) throw new Error('bcryptjs not installed');
    return bcrypt.hash(plain, 12);
  }
  if (ALGO === 'argon2') {
    if (!argon2) throw new Error('argon2 not installed');
    return argon2.hash(plain);
  }
  // 2) Auto-pick: prefer argon2 if available, else bcrypt
  if (argon2) return argon2.hash(plain);
  if (bcrypt) return bcrypt.hash(plain, 12);
  throw new Error('No hashing library available. Install argon2 or bcryptjs.');
}

async function verifyPassword(plain, hashed) {
  if (!plain || !hashed) return false;

  // 1) Use prefix hints first
  if (hasArgonPrefix(hashed) && argon2) {
    try { return await argon2.verify(hashed, plain); } catch { /* fall through */ }
  }
  if (hasBcryptPrefix(hashed) && bcrypt) {
    try { return await bcrypt.compare(plain, hashed); } catch { /* fall through */ }
  }

  // 2) Try both (covers legacy/mixed data)
  if (argon2) { try { if (await argon2.verify(hashed, plain)) return true; } catch {} }
  if (bcrypt) { try { if (await bcrypt.compare(plain, hashed)) return true; } catch {} }

  return false;
}

module.exports = { hashPassword, verifyPassword };
