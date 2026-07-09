const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Foydalanuvchini token orqali aniqlash
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token topilmadi, iltimos tizimga kiring" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Foydalanuvchi topilmadi yoki bloklangan" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan" });
  }
}

// Faqat berilgan rollarga ruxsat berish: requireRole("teacher", "superadmin")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Bu amal uchun ruxsatingiz yo'q" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
