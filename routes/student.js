const express = require("express");
const Lesson = require("../models/Lesson");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

// Faqat o'z guruhidagi, aktiv darslar (va shu darslardagi aktiv videolar)
router.get("/lessons", async (req, res) => {
  if (!req.user.group) return res.json([]);
  const lessons = await Lesson.find({ group: req.user.group, isActive: true })
    .populate({
      path: "videos",
      match: { isActive: true },
      select: "title durationSeconds thumbnail status qualityVariants",
    });
  res.json(lessons);
});

router.get("/lessons/:id", async (req, res) => {
  const lesson = await Lesson.findOne({
    _id: req.params.id,
    group: req.user.group,
    isActive: true,
  }).populate({
    path: "videos",
    match: { isActive: true },
  });
  if (!lesson) return res.status(404).json({ error: "Dars topilmadi" });
  res.json(lesson);
});

module.exports = router;
