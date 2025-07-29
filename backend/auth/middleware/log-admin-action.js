const pool = require("../../db");

const logAdminAction = async ({
  performed_by,
  action,
  target_user_id,
  new_email,
  status,
  error_message,
  type,
  completed_at
}) => {
  if (!performed_by || !action) {
    console.warn("⚠️ Missing required admin log fields");
    return;
  }

  // ⏱️ Auto-assign completed_at if not manually passed and status is completed
  if (status === "completed" && !completed_at) {
    completed_at = new Date();
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
        type,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        performed_by,
        action,
        target_user_id || null,
        new_email || null,
        status || "completed",
        error_message || null,
        type || "admin",
        completed_at || null
      ]
    );
    console.log("📝 Admin action logged");
  } catch (err) {
    console.error("❌ Failed to log admin action:", err);
  }
};

module.exports = logAdminAction;
