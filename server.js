require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const superadminRoutes = require("./routes/superadmin");
const teacherRoutes = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const videoRoutes = require("./routes/video");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/videos", videoRoutes);

// Umumiy xatolik ushlagich (masalan multer fayl hajmi xatoligi)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server xatoligi" });
});

async function ensureSuperAdmin() {
  const exists = await User.findOne({ role: "superadmin" });
  if (exists) return;
  const username = process.env.SUPERADMIN_USERNAME || "admin";
  const password = process.env.SUPERADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await User.hashPassword(password);
  const admin = new User({ role: "superadmin", username, passwordHash });
  admin.firstName = "Super";
  admin.lastName = "Admin";
  await admin.save();
  console.log(`[Init] SuperAdmin yaratildi -> login: ${username} / parol: ${password}`);
  console.log("[Init] Birinchi kirishdan so'ng parolni albatta almashtiring!");
}

async function start() {
  await connectDB();
  await ensureSuperAdmin();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`[Server] http://localhost:${PORT} portida ishga tushdi`));
}

start();
