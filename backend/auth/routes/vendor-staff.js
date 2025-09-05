// backend/auth/routes/vendor-staff.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Helpers
function isVendor(user) {
  return user && String(user.role || '').toLowerCase() === 'vendor';
}
function normEmail(v) {
  return (String(v || '').trim().toLowerCase()) || null;
}

/**
 * GET /api/vendor/vendorstaff
 * List staff for the signed-in vendor
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!isVendor(req.user)) {
      return res.status(403).json({ message: 'Only vendors can view staff' });
    }
    const vendorUserId = req.user.id;

    const { rows } = await pool.query(
      `SELECT id,
              username,
              display_name AS name,
              COALESCE(email, '') AS email,
              COALESCE(is_active, TRUE) AS is_active,
              created_at
         FROM vendor_staff
        WHERE vendor_user_id = $1
        ORDER BY created_at DESC NULLS LAST, id DESC`,
      [vendorUserId]
    );

    // return { staff: [...] } to match the UI expectation
    res.json({ staff: rows });
  } catch (e) {
    console.error('[vendor-staff GET] error:', e);
    res.status(500).json({ message: 'Failed to load staff' });
  }
});

/**
 * POST /api/vendor/vendorstaff
 * Body: { name, email, password }
 * - Creates a staff user under the signed-in vendor
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!isVendor(req.user)) {
      return res.status(403).json({ message: 'Only vendors can add staff' });
    }
    const vendorUserId = req.user.id;

    const name = String(req.body?.name || '').trim();
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // username defaults to email (unique per vendor)
    const username = email;

    // Optional: ensure not already used under this vendor
    const dup = await pool.query(
      `SELECT id FROM vendor_staff WHERE vendor_user_id = $1 AND (LOWER(username) = $2 OR LOWER(email) = $2) LIMIT 1`,
      [vendorUserId, email]
    );
    if (dup.rows.length) {
      return res.status(409).json({ message: 'Staff with that email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const ins = await pool.query(
      `INSERT INTO vendor_staff
         (vendor_user_id, username, email, display_name, password_hash, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
       RETURNING id, username, display_name AS name, email, is_active`,
      [vendorUserId, username, email, name, password_hash]
    );

    res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error('[vendor-staff POST] error:', e);
    res.status(500).json({ message: 'Failed to add staff' });
  }
});

/**
 * PATCH /api/vendor/vendorstaff/:id
 * Body: { name?, email?, password? }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    if (!isVendor(req.user)) {
      return res.status(403).json({ message: 'Only vendors can update staff' });
    }
    const vendorUserId = req.user.id;
    const staffId = Number(req.params.id);

    const name = (req.body?.name ?? '').toString().trim();
    const email = normEmail(req.body?.email);
    const password = (req.body?.password ?? '').toString();

    // Build dynamic update
    const sets = [];
    const vals = [];
    let idx = 1;

    if (name)  { sets.push(`display_name = $${idx++}`); vals.push(name); }
    if (email) {
      // Prevent duplicate under this vendor
      const dup = await pool.query(
        `SELECT id FROM vendor_staff
          WHERE vendor_user_id = $1 AND LOWER(email) = $2 AND id <> $3 LIMIT 1`,
        [vendorUserId, email, staffId]
      );
      if (dup.rows.length) {
        return res.status(409).json({ message: 'Another staff already uses that email' });
      }
      sets.push(`email = $${idx++}`); vals.push(email);
      sets.push(`username = $${idx++}`); vals.push(email); // keep username = email
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${idx++}`); vals.push(hash);
    }

    if (!sets.length) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    vals.push(vendorUserId);      // $idx
    vals.push(staffId);           // $idx+1

    const sql = `
      UPDATE vendor_staff
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE vendor_user_id = $${idx} AND id = $${idx + 1}
       RETURNING id, username, display_name AS name, email, is_active
    `;

    const up = await pool.query(sql, vals);
    if (!up.rows.length) return res.status(404).json({ message: 'Staff not found' });

    res.json(up.rows[0]);
  } catch (e) {
    console.error('[vendor-staff PATCH] error:', e);
    res.status(500).json({ message: 'Failed to update staff' });
  }
});

/**
 * DELETE /api/vendor/vendorstaff/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (!isVendor(req.user)) {
      return res.status(403).json({ message: 'Only vendors can delete staff' });
    }
    const vendorUserId = req.user.id;
    const staffId = Number(req.params.id);

    const del = await pool.query(
      `DELETE FROM vendor_staff
        WHERE vendor_user_id = $1 AND id = $2
        RETURNING id`,
      [vendorUserId, staffId]
    );

    if (!del.rows.length) return res.status(404).json({ message: 'Staff not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[vendor-staff DELETE] error:', e);
    res.status(500).json({ message: 'Failed to delete staff' });
  }
});

/**
 * POST /auth/vendor-staff/login
 * Body: { vendor_email, username (or email), password }
 * - Issues a vendor JWT (long-lived if you set JWT_VENDOR_EXPIRES) and records staff context in sessions
 */
router.post('/login', async (req, res) => {
  try {
    const { vendor_email, username, password } = req.body || {};
    const emailVendor = normEmail(vendor_email);
    const uname = String(username || '').trim().toLowerCase();

    if (!emailVendor || !uname || !password) {
      return res.status(400).json({ message: 'Missing vendor_email, username, or password' });
    }

    // 1) Find vendor user
    const vq = await pool.query(
      `SELECT id, email, role, type, status, first_name, last_name
         FROM users
        WHERE LOWER(email) = $1
        LIMIT 1`,
      [emailVendor]
    );
    const vendorUser = vq.rows[0];
    if (!vendorUser || String(vendorUser.role).toLowerCase() !== 'vendor') {
      return res.status(404).json({ message: 'Vendor account not found' });
    }
    if (vendorUser.status && String(vendorUser.status).toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'Vendor account is not active' });
    }

    // 2) Find staff (match by username OR email under this vendor)
    const sq = await pool.query(
      `SELECT id, vendor_user_id, username, email, display_name, password_hash, is_active
         FROM vendor_staff
        WHERE vendor_user_id = $1
          AND (LOWER(username) = $2 OR LOWER(email) = $2)
        LIMIT 1`,
      [vendorUser.id, uname]
    );
    const staff = sq.rows[0];
    if (!staff) return res.status(404).json({ message: 'Staff user not found' });
    if (staff.is_active === false) return res.status(403).json({ message: 'Staff user disabled' });

    // 3) Verify password
    const ok = await bcrypt.compare(password, staff.password_hash || '');
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    // 4) Create vendor JWT (longer if JWT_VENDOR_EXPIRES is set)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ message: 'Server missing JWT secret' });

    const vendorExpSeconds = Number(process.env.JWT_VENDOR_EXPIRES || 43200); // default 12h

    const payload = {
      id: vendorUser.id,
      email: vendorUser.email,
      role: vendorUser.role || 'vendor',
      type: vendorUser.type || 'vendor',
      first_name: vendorUser.first_name || null,
      last_name: vendorUser.last_name || null
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: vendorExpSeconds });

    // 5) Record session with staff context
    await pool.query(
      `INSERT INTO sessions (email, jwt_token, staff_id, staff_username, staff_display_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [vendorUser.email, token, staff.id, staff.username, staff.display_name || null]
    );

    res.json({
      token,
      user: {
        id: vendorUser.id,
        email: vendorUser.email,
        role: 'vendor',
        type: vendorUser.type || 'vendor',
        first_name: vendorUser.first_name || null,
        last_name: vendorUser.last_name || null,
        staff: {
          id: staff.id,
          username: staff.username,
          display_name: staff.display_name || null,
          email: staff.email || null
        }
      }
    });
  } catch (e) {
    console.error('[vendor-staff login] error:', e);
    res.status(500).json({ message: 'Login failed' });
  }
});

module.exports = router;
