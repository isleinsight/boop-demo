const db = require('../db');

async function logAdminAction({ admin_id, action, type, new_email = null, status = 'pending', error_message = null }) {
  try {
    await db.query(
      `INSERT INTO admin_actions (admin_id, action, type, new_email, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin_id, action, type, new_email, status, error_message]
    );
  } catch (err) {
    console.error("❌ Failed to log admin action:", err.message);
  }
}

module.exports = logAdminAction;
