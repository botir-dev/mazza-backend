const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    isActive: { type: Boolean, default: true }, // teacher/superadmin o'chirmaguncha true qoladi
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lesson", lessonSchema);
