const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
// future:
// const Agent = require("../models/Agent");
const Partner = require("../models/Partner");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    // ✅ Extract token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    // ✅ Verify token
    const decoded = jwt.verify(token, "secretkey");

    let user = null;

    // 🔥 ROLE BASED FETCH
    if (decoded.role === "admin") {
      user = await Admin.findById(decoded.id);

      if (!user || !user.isActive) {
        return res.status(403).json({ message: "Admin access denied" });
      }
    }

    // 🔜 future roles (ready code)
    /*
    else if (decoded.role === "agent") {
      user = await Agent.findById(decoded.id);
    } 
    else if (decoded.role === "partner") {
      user = await Partner.findById(decoded.id);
    }
    */

    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    // ✅ universal user object
    req.user = {
      id: user._id,
      role: decoded.role,
      data: user
    };

    next();

  } catch (err) {
    console.log("JWT ERROR:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};