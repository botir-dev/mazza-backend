const express = require("express");
const User = require("../models/User");
const Group = require("../models/Group");
const Lesson = require("../models/Lesson");
const Video = require("../models/Video");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("teacher"));

/* ---------------- GURUHLAR ---------------- */

router.post("/groups", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Guruh nomini kiriting" });
  const group = await Group.create({ name, teacher: req.user._id });
  res.status(201).json(group);
});

router.get("/groups", async (req, res) => {
  const groups = await Group.find({ teacher: req.user._id, isActive: true });
  res.json(groups);
});

router.delete("/groups/:id", async (req, res) => {
  const group = await Group.findOneAndUpdate(
    { _id: req.params.id, teacher: req.user._id },
    { isActive: false },
    { new: true }
  );
  if (!group) return res.status(404).json({ error: "Guruh topilmadi" });
  res.json({ ok: true });
});

/* ---------------- STUDENTLAR ---------------- */

// Yangi student yaratish (5 xonali unikal ID avtomatik beriladi)
router.post("/students", async (req, res) => {
  try {
    const { firstName, lastName, age, groupId, password } = req.body;
    if (!firstName || !lastName || !groupId || !password) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }
    const group = await Group.findOne({ _id: groupId, teacher: req.user._id });
    if (!group) return res.status(404).json({ error: "Guruh topilmadi" });

    const studentId = await User.generateUniqueStudentId();
    const passwordHash = await User.hashPassword(password);

    const student = new User({
      role: "student",
      studentId,
      passwordHash,
      group: group._id,
      teacher: req.user._id,
      createdBy: req.user._id,
    });
    student.firstName = firstName;
    student.lastName = lastName;
    if (age) student.age = age;
    await student.save();

    res.status(201).json({
      id: student._id,
      studentId: student.studentId,
      firstName,
      lastName,
      age: age || null,
      group: group.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatoligi" });
  }
});

router.get("/groups/:groupId/students", async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, teacher: req.user._id });
  if (!group) return res.status(404).json({ error: "Guruh topilmadi" });
  const students = await User.find({ group: group._id, role: "student" });
  res.json(students.map((s) => ({
    id: s._id,
    studentId: s.studentId,
    firstName: s.firstName,
    lastName: s.lastName,
    age: s.age,
    isActive: s.isActive,
  })));
});

router.patch("/students/:id/status", async (req, res) => {
  const { isActive } = req.body;
  const student = await User.findOneAndUpdate(
    { _id: req.params.id, teacher: req.user._id, role: "student" },
    { isActive },
    { new: true }
  );
  if (!student) return res.status(404).json({ error: "Student topilmadi" });
  res.json({ ok: true });
});

/* ---------------- DARSLAR ---------------- */

router.post("/lessons", async (req, res) => {
  const { title, description, groupId } = req.body;
  if (!title || !groupId) return res.status(400).json({ error: "Sarlavha va guruhni kiriting" });
  const group = await Group.findOne({ _id: groupId, teacher: req.user._id });
  if (!group) return res.status(404).json({ error: "Guruh topilmadi" });

  const lesson = await Lesson.create({
    title,
    description: description || "",
    group: group._id,
    teacher: req.user._id,
  });
  res.status(201).json(lesson);
});

router.get("/groups/:groupId/lessons", async (req, res) => {
  const lessons = await Lesson.find({
    group: req.params.groupId,
    teacher: req.user._id,
    isActive: true,
  }).populate("videos");
  res.json(lessons);
});

router.delete("/lessons/:id", async (req, res) => {
  const lesson = await Lesson.findOneAndUpdate(
    { _id: req.params.id, teacher: req.user._id },
    { isActive: false },
    { new: true }
  );
  if (!lesson) return res.status(404).json({ error: "Dars topilmadi" });
  res.json({ ok: true });
});

// Darsdagi bitta videoni o'chirish (muddatsiz saqlanadi, faqat shu amal orqali o'chadi)
router.delete("/videos/:id", async (req, res) => {
  const video = await Video.findById(req.params.id).populate("lesson");
  if (!video || String(video.lesson.teacher) !== String(req.user._id)) {
    return res.status(404).json({ error: "Video topilmadi" });
  }
  video.isActive = false;
  await video.save();
  res.json({ ok: true });
});

module.exports = router;
