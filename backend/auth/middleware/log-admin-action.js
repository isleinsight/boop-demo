const pool = require("../../db");

const logAdminAction = async ({
  performed_by,
  action,
  target_user_id,
  new_email,
  status,
  error_message,
  type
}) => {
  if (!performed_by || !action) {
    console.warn("⚠️ Missing required admin log fields");
    return;
  }

  try {
    await pool.query(
      `INSERT INTO admin_actions (
        performed_by, 
        action, 
        target_user_id, 
        new_email, 
        status, 
        error_message, 
        type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        performed_by,
        action,
        target_user_id || null,
        new_email || null,
        status || "completed",
        error_message || null,
        type || "admin"
      ]
    );
    console.log("📝 Admin action logged");
  } catch (err) {
    console.error("❌ Failed to log admin action:", err);
  }
};

module.exports = logAdminAction;
