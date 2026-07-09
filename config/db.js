const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("[DB] MongoDB ulanish muvaffaqiyatli o'rnatildi");
  } catch (err) {
    console.error("[DB] Ulanishda xatolik:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
