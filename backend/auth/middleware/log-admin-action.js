const pool = require("../../db");

const logAdminAction = async ({ admin_id, action, target_id, target_type, admin_type }) => {
  if (!admin_id || !action) {
    console.warn("⚠️ Missing required admin log fields");
    return;
  }

  try {
    await pool.query(
      `INSERT INTO admin_actions (admin_id, action, target_id, target_type, admin_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin_id, action, target_id || null, target_type || null, admin_type || null]
    );
    console.log("📝 Admin action logged");
  } catch (err) {
    console.error("❌ Failed to log admin action:", err);
  }
};

module.exports = logAdminAction;
