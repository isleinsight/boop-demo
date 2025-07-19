const jwt = require("jsonwebtoken");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("🚫 No token provided in Authorization header");
    return res.status(401).json({ message: "Token missing" });
  }

  try {
    // 🔐 Decode and verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token verified:", decoded);

    // Attach the decoded token payload to the request object
    req.user = decoded;

    // Move on to the next handler
    next();

  } catch (err) {
    console.error("🔥 JWT verification failed:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
