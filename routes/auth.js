const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Bruteforce hujumlardan himoya: 15 daqiqada 20 ta urinish
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." },
});

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

/**
 * POST /api/auth/login
 * SuperAdmin/Teacher -> { username, password }
 * Student             -> { studentId, password }
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, studentId, password } = req.body;
    if (!password || (!username && !studentId)) {
      return res.status(400).json({ error: "Login ma'lumotlari to'liq emas" });
    }

    const query = studentId ? { studentId, role: "student" } : { username };
    const user = await User.findOne(query);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
    }

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Login yoki parol noto'g'ri" });

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        studentId: user.studentId,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatoligi" });
  }
});

// Joriy foydalanuvchi ma'lumotlarini olish
router.get("/me", requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    id: u._id,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    studentId: u.studentId,
    group: u.group,
  });
});

module.exports = router;
