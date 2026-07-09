/**
 * Ma'lumotlar bazasidagi shaxsiy ma'lumotlarni (ism, familiya va h.k.)
 * AES-256-GCM algoritmi bilan shifrlash/deshifrlash uchun yordamchi modul.
 *
 * Har bir qiymat individual random IV bilan shifrlanadi, shuning uchun
 * bir xil ochiq matn har safar boshqacha shifrmatn beradi (xavfsizlik uchun muhim).
 */
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY .env faylida sozlanmagan");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY 32 bayt (base64) bo'lishi kerak. `openssl rand -base64 32` bilan generatsiya qiling");
  }
  return buf;
}

/**
 * Matnni shifrlaydi. Natija: "iv:authTag:cipherText" (barchasi base64, ':' bilan ajratilgan)
 */
function encryptField(plainText) {
  if (plainText === undefined || plainText === null) return plainText;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Shifrlangan matnni asl holatiga qaytaradi
 */
function decryptField(cipherPacked) {
  if (!cipherPacked) return cipherPacked;
  const parts = String(cipherPacked).split(":");
  if (parts.length !== 3) return cipherPacked; // shifrlanmagan eski format bo'lsa - o'zgarishsiz qaytarish
  const [ivB64, tagB64, dataB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

module.exports = { encryptField, decryptField };
