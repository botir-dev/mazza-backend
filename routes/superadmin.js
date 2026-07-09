const express = require("express");
const User = require("../models/User");
const Group = require("../models/Group");
const Lesson = require("../models/Lesson");
const Video = require("../models/Video");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("superadmin"));

// Yangi ustoz yaratish
router.post("/teachers", async (req, res) => {
  try {
    const { firstName, lastName, username, password } = req.body;
    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: "Bu username band" });

    const passwordHash = await User.hashPassword(password);
    const teacher = new User({
      role: "teacher",
      username,
      passwordHash,
      createdBy: req.user._id,
    });
    teacher.firstName = firstName;
    teacher.lastName = lastName;
    await teacher.save();

    res.status(201).json({ id: teacher._id, firstName, lastName, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatoligi" });
  }
});

// Barcha ustozlar ro'yxati
router.get("/teachers", async (req, res) => {
  const teachers = await User.find({ role: "teacher" }).select("-passwordHash");
  res.json(teachers.map((t) => ({
    id: t._id,
    firstName: t.firstName,
    lastName: t.lastName,
    username: t.username,
    isActive: t.isActive,
    createdAt: t.createdAt,
  })));
});

// Ustozni bloklash/aktivlashtirish
router.patch("/teachers/:id/status", async (req, res) => {
  const { isActive } = req.body;
  const teacher = await User.findOneAndUpdate(
    { _id: req.params.id, role: "teacher" },
    { isActive },
    { new: true }
  );
  if (!teacher) return res.status(404).json({ error: "Ustoz topilmadi" });
  res.json({ id: teacher._id, isActive: teacher.isActive });
});

// Umumiy statistika (dashboard uchun)
router.get("/stats", async (req, res) => {
  const [teachers, students, groups, lessons, videos] = await Promise.all([
    User.countDocuments({ role: "teacher" }),
    User.countDocuments({ role: "student" }),
    Group.countDocuments({}),
    Lesson.countDocuments({}),
    Video.countDocuments({ isActive: true }),
  ]);
  res.json({ teachers, students, groups, lessons, videos });
});

// SuperAdmin ham istalgan videoni/darsni o'chira oladi
router.delete("/videos/:id", async (req, res) => {
  const video = await Video.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!video) return res.status(404).json({ error: "Video topilmadi" });
  res.json({ ok: true });
});

router.delete("/lessons/:id", async (req, res) => {
  const lesson = await Lesson.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!lesson) return res.status(404).json({ error: "Dars topilmadi" });
  res.json({ ok: true });
});

module.exports = router;
