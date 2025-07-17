const pool = require("../../db");

const logAdminAction = async ({
  admin_id,
  action,
  target_user_id,
  type,
  status,
  old_email = null,
  new_email = null
}) => {
  if (!admin_id || !action) {
    console.warn("⚠️ Missing required admin log fields");
    return;
  }

  try {
    await pool.query(
      `INSERT INTO admin_actions (
        admin_id,
        performed_by,
        action,
        target_user_id,
        type,
        status,
        old_email,
        new_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        admin_id,       // performed_by
        admin_id,       // again for admin_id (some schemas separate these)
        action,
        target_user_id || null,
        type || null,
        status || null,
        old_email,
        new_email
      ]
    );
    console.log("📝 Admin action logged");
  } catch (err) {
    console.error("❌ Failed to log admin action:", err.message);
  }
};

module.exports = logAdminAction;
