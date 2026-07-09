const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Xavfsizlik uchun video va audio qismlari fizik jihatdan
    // ALOHIDA fayllarda saqlanadi (video-only .mp4 + audio-only .m4a),
    // va frontendda ikkalasi sinxron holda birga ijro etiladi.
    // Eslatma: yuklangan payt bu ikkalasi hali bo'sh bo'ladi (status="processing"),
    // ffmpeg qayta ishlab bo'lgach to'ldiriladi (status="ready") - shuning
    // uchun bu yerda required qilib belgilanmagan.
    videoFileName: { type: String, default: "" }, // faqat video trek (audiosiz)
    audioFileName: { type: String, default: "" }, // faqat audio trek

    // Turli sifatdagi video variantlar (masalan 1080p/720p/480p)
    // key - sifat nomi, value - fayl nomi
    qualityVariants: {
      type: Map,
      of: String,
      default: {},
    },

    durationSeconds: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    thumbnail: { type: String },

    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },

    isActive: { type: Boolean, default: true }, // teacher/superadmin o'chirmaguncha true qoladi
  },
  { timestamps: true },
);

module.exports = mongoose.model("Video", videoSchema);
