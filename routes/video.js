const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Video = require("../models/Video");
const Lesson = require("../models/Lesson");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  processUpload,
  generateWatermarkedVideo,
  VIDEO_DIR,
  AUDIO_DIR,
} = require("../utils/videoProcessor");

const router = express.Router();

// Vaqtinchalik yuklash papkasi (ffmpeg qayta ishlagandan keyin o'chiriladi)
const TMP_DIR = path.join(__dirname, "..", "uploads", "tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: Number(process.env.MAX_VIDEO_SIZE) || 2 * 1024 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/x-matroska",
      "video/webm",
    ];
    if (!allowed.includes(file.mimetype))
      return cb(new Error("Faqat video fayllar qabul qilinadi"));
    cb(null, true);
  },
});

/**
 * POST /api/videos/upload
 * multipart/form-data: video (fayl), title, lessonId
 * Faqat teacher, faqat o'z darsiga yuklay oladi.
 */
router.post(
  "/upload",
  requireAuth,
  requireRole("teacher"),
  upload.single("video"),
  async (req, res) => {
    const tmpFile = req.file && req.file.path;
    try {
      const { title, lessonId } = req.body;
      if (!req.file)
        return res.status(400).json({ error: "Video fayl biriktirilmagan" });
      if (!title || !lessonId)
        return res.status(400).json({ error: "Sarlavha va dars ID kerak" });

      const lesson = await Lesson.findOne({
        _id: lessonId,
        teacher: req.user._id,
      });
      if (!lesson) return res.status(404).json({ error: "Dars topilmadi" });

      const video = new Video({
        title,
        lesson: lesson._id,
        uploadedBy: req.user._id,
        videoFileName: "",
        audioFileName: "",
        status: "processing",
      });
      await video.save();
      lesson.videos.push(video._id);
      await lesson.save();

      // Javobni darhol qaytaramiz, qayta ishlash fon rejimida davom etadi
      res.status(202).json({ id: video._id, status: "processing" });

      // --- Fon jarayon: audio/video ajratish, sifat variantlari, thumbnail ---
      try {
        const result = await processUpload(tmpFile);
        video.videoFileName = result.videoFileName;
        video.audioFileName = result.audioFileName;
        video.thumbnail = result.thumbnail;
        video.durationSeconds = result.durationSeconds;
        video.qualityVariants = result.qualityVariants;
        video.status = "ready";
        await video.save();
      } catch (procErr) {
        console.error("[video processing xatoligi]", procErr);
        video.status = "failed";
        await video.save();
      } finally {
        if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    } catch (err) {
      console.error(err);
      if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      if (!res.headersSent) res.status(500).json({ error: "Server xatoligi" });
    }
  },
);

// Video holatini (processing/ready/failed) tekshirish
router.get("/:id/status", requireAuth, async (req, res) => {
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ error: "Video topilmadi" });
  // qualityVariants - haqiqiy Mongoose Map, shuning uchun Object.keys() emas,
  // Map.keys() orqali o'qish kerak (aks holda ichki texnik xususiyatlar chiqib qoladi)
  const qualities = video.qualityVariants
    ? Array.from(video.qualityVariants.keys())
    : [];
  res.json({ status: video.status, qualities });
});

/**
 * Ruxsatni tekshirish: teacher - o'z darsi bo'lsa, student - o'z guruhidagi
 * darsga biriktirilgan bo'lsa ko'ra oladi.
 */
async function checkAccess(req, video) {
  const lesson = await Lesson.findById(video.lesson);
  if (!lesson || !lesson.isActive) return false;
  if (req.user.role === "teacher")
    return String(lesson.teacher) === String(req.user._id);
  if (req.user.role === "superadmin") return true;
  if (req.user.role === "student")
    return String(lesson.group) === String(req.user.group);
  return false;
}

/**
 * GET /api/videos/:id/stream?quality=720p
 * Range so'rovlarni qo'llab-quvvatlaydi (video oldinga/orqaga surish uchun shart).
 * Student uchun har doim uning 5 xonali ID'si "suv belgisi" sifatida
 * videoga kuydirilgan holatda beriladi (natija keshlanadi).
 */
router.get("/:id/stream", requireAuth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video || !video.isActive || video.status !== "ready") {
      return res
        .status(404)
        .json({ error: "Video topilmadi yoki hali tayyor emas" });
    }
    const allowed = await checkAccess(req, video);
    if (!allowed) return res.status(403).json({ error: "Ruxsat yo'q" });

    const requestedQuality = req.query.quality;
    const hasVariant =
      requestedQuality && video.qualityVariants?.get(requestedQuality);
    const quality = hasVariant ? requestedQuality : "original";
    const videoFile =
      video.qualityVariants?.get(quality) || video.videoFileName;
    const videoOnlyPath = path.join(VIDEO_DIR, videoFile);
    const audioOnlyPath = path.join(AUDIO_DIR, video.audioFileName);

    let filePath;
    if (req.user.role === "student") {
      // Har bir student uchun o'zining ID'si kuydirilgan nusxa (keshlanadi)
      filePath = await generateWatermarkedVideo({
        videoId: String(video._id),
        videoOnlyPath,
        audioOnlyPath,
        studentId: req.user.studentId,
        quality,
      });
    } else {
      // Teacher/SuperAdmin ko'rib chiqishi uchun watermarksiz, faqat video trek
      // (audio yo'q bo'lgani uchun ko'rish tavsiya etilmaydi - shuning uchun
      // ularga ham umumiy "PREVIEW" watermarki bilan birlashtirilgan nusxa beriladi)
      filePath = await generateWatermarkedVideo({
        videoId: String(video._id),
        videoOnlyPath,
        audioOnlyPath,
        studentId: "PREVIEW",
        quality,
      });
    }

    streamFileWithRange(filePath, req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Video berishda xatolik" });
  }
});

function streamFileWithRange(filePath, req, res) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Yuklab olishni qiyinlashtirish uchun (to'liq oldini olib bo'lmaydi, lekin cheklaydi):
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = router;
