const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { encryptField, decryptField } = require("../utils/encryption");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["superadmin", "teacher", "student"],
      required: true,
      index: true,
    },

    // Login uchun (superadmin/teacher uchun username, student uchun studentId ishlatiladi)
    username: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },

    // --- Shaxsiy ma'lumotlar (shifrlangan holda saqlanadi) ---
    firstNameEnc: { type: String, required: true },
    lastNameEnc: { type: String, required: true },
    ageEnc: { type: String }, // faqat studentlar uchun

    // Faqat studentlar uchun: 5 xonali unikal ID
    studentId: { type: String, unique: true, sparse: true, index: true },

    // Bog'lanishlar
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" }, // faqat student
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // student -> teacher, group -> teacher
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// --- Virtual maydonlar: shifrlangan qiymatlarni oddiy o'qish/yozish uchun ---
userSchema.virtual("firstName")
  .get(function () { return this.firstNameEnc ? decryptField(this.firstNameEnc) : undefined; })
  .set(function (val) { this.firstNameEnc = encryptField(val); });

userSchema.virtual("lastName")
  .get(function () { return this.lastNameEnc ? decryptField(this.lastNameEnc) : undefined; })
  .set(function (val) { this.lastNameEnc = encryptField(val); });

userSchema.virtual("age")
  .get(function () { return this.ageEnc ? decryptField(this.ageEnc) : undefined; })
  .set(function (val) { if (val !== undefined && val !== null && val !== "") this.ageEnc = encryptField(val); });

userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function (plain) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
};

// Studentlar uchun 5 xonali (10000-99999) unikal ID generatsiya qilish
userSchema.statics.generateUniqueStudentId = async function () {
  const Model = this;
  let id;
  let exists = true;
  while (exists) {
    id = String(Math.floor(10000 + Math.random() * 90000));
    exists = await Model.exists({ studentId: id });
  }
  return id;
};

module.exports = mongoose.model("User", userSchema);
