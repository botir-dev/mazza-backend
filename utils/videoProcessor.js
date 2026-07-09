/**
 * Video bilan ishlash uchun ffmpeg asosidagi yordamchi funksiyalar.
 *
 * Serverda ffmpeg o'rnatilgan bo'lishi shart:
 *   Ubuntu/Debian: sudo apt install ffmpeg
 *
 * Nima uchun video/audio alohida saqlanadi?
 *  - Yaxlit .mp4 faylni to'g'ridan-to'g'ri static sifatida berish oson o'g'irlanadi.
 *  - Video-only va audio-only treklarni alohida, tasodifiy nomlar bilan saqlab,
 *    faqat backend orqali (auth + huquq tekshiruvidan keyin) frontendda
 *    ikkalasini birlashtirib (MSE - Media Source Extensions) ijro etish
 *    oddiy "faylni ko'chirib olish" urinishlarini ancha qiyinlashtiradi.
 */
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const VIDEO_DIR = path.join(UPLOAD_ROOT, "videos");
const AUDIO_DIR = path.join(UPLOAD_ROOT, "audio");
const THUMB_DIR = path.join(UPLOAD_ROOT, "thumbnails");
const WATERMARK_CACHE_DIR = path.join(UPLOAD_ROOT, "watermarked");

for (const dir of [VIDEO_DIR, AUDIO_DIR, THUMB_DIR, WATERMARK_CACHE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const QUALITY_PRESETS = {
  "1080p": { height: 1080, bitrate: "4500k" },
  "720p": { height: 720, bitrate: "2500k" },
  "480p": { height: 480, bitrate: "1200k" },
  "360p": { height: 360, bitrate: "700k" },
};

/**
 * Yuklangan asl faylni:
 *  1) audiosiz video trek (mp4, h264) va
 *  2) videosiz audio trek (m4a, aac) ga ajratadi,
 *  3) turli sifatdagi video variantlarini yaratadi,
 *  4) thumbnail (preview rasm) chiqaradi.
 */
async function processUpload(originalFilePath) {
  const baseId = uuidv4();
  const videoOnlyName = `${baseId}_video.mp4`;
  const audioOnlyName = `${baseId}_audio.m4a`;
  const thumbName = `${baseId}_thumb.jpg`;

  const videoOnlyPath = path.join(VIDEO_DIR, videoOnlyName);
  const audioOnlyPath = path.join(AUDIO_DIR, audioOnlyName);
  const thumbPath = path.join(THUMB_DIR, thumbName);

  // 1) Faqat video trek (audiosiz)
  await new Promise((resolve, reject) => {
    ffmpeg(originalFilePath)
      .noAudio()
      .videoCodec("libx264")
      .outputOptions(["-preset veryfast", "-crf 20", "-movflags +faststart"])
      .save(videoOnlyPath)
      .on("end", resolve)
      .on("error", reject);
  });

  // 2) Faqat audio trek
  await new Promise((resolve, reject) => {
    ffmpeg(originalFilePath)
      .noVideo()
      .audioCodec("aac")
      .audioBitrate("160k")
      .save(audioOnlyPath)
      .on("end", resolve)
      .on("error", reject);
  });

  // 3) Turli sifat variantlari (720p va 480p) - asosiy video trekdan
  const qualityVariants = { original: videoOnlyName };
  for (const [label, preset] of Object.entries({ "720p": QUALITY_PRESETS["720p"], "480p": QUALITY_PRESETS["480p"] })) {
    const variantName = `${baseId}_video_${label}.mp4`;
    const variantPath = path.join(VIDEO_DIR, variantName);
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(videoOnlyPath)
          .videoCodec("libx264")
          .size(`?x${preset.height}`)
          .videoBitrate(preset.bitrate)
          .outputOptions(["-preset veryfast", "-movflags +faststart"])
          .noAudio()
          .save(variantPath)
          .on("end", resolve)
          .on("error", reject);
      });
      qualityVariants[label] = variantName;
    } catch (e) {
      console.warn(`[video] ${label} varianti yaratilmadi:`, e.message);
    }
  }

  // 4) Thumbnail
  const duration = await getDuration(originalFilePath);
  await new Promise((resolve, reject) => {
    ffmpeg(originalFilePath)
      .screenshots({
        timestamps: [Math.min(2, Math.max(0, duration / 4))],
        filename: thumbName,
        folder: THUMB_DIR,
        size: "480x270",
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return {
    videoFileName: videoOnlyName,
    audioFileName: audioOnlyName,
    thumbnail: thumbName,
    qualityVariants,
    durationSeconds: Math.round(duration),
  };
}

function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration || 0);
    });
  });
}

/**
 * Video (tanlangan sifat) + audio treklarini birlashtirib,
 * ustiga student'ning 5 xonali ID'sini "harakatlanuvchi suv belgisi" (watermark)
 * sifatida chizib, yakuniy faylni keshga (watermarked/) saqlaydi.
 * Bir xil video+student+sifat uchun natija keshlanadi - qayta generatsiya qilinmaydi.
 *
 * Watermark har 120 soniyada ekranning boshqa burchagiga o'tadi (4 ta pozitsiya
 * bo'ylab aylanadi), shrifti yarim-shaffof (xiralashgan oq/qora kontrastli matn).
 */
function getWatermarkedPath(videoId, studentId, quality) {
  return path.join(WATERMARK_CACHE_DIR, `${videoId}_${studentId}_${quality}.mp4`);
}

async function generateWatermarkedVideo({ videoId, videoOnlyPath, audioOnlyPath, studentId, quality }) {
  const outPath = getWatermarkedPath(videoId, studentId, quality);
  if (fs.existsSync(outPath)) return outPath; // kesh mavjud

  // 4 ta pozitsiya: yuqori-chap, yuqori-o'ng, past-chap, past-o'ng.
  // Har 120 soniyada pozitsiya almashadi (mod(t,480) 4 ta 120 soniyalik blokka bo'linadi).
  const positions = [
    { x: "w*0.03", y: "h*0.05" },
    { x: "w*0.80", y: "h*0.05" },
    { x: "w*0.03", y: "h*0.88" },
    { x: "w*0.80", y: "h*0.88" },
  ];
  const xExpr = `if(lt(mod(t\\,480)\\,120)\\,${positions[0].x}\\,if(lt(mod(t\\,480)\\,240)\\,${positions[1].x}\\,if(lt(mod(t\\,480)\\,360)\\,${positions[2].x}\\,${positions[3].x})))`;
  const yExpr = `if(lt(mod(t\\,480)\\,120)\\,${positions[0].y}\\,if(lt(mod(t\\,480)\\,240)\\,${positions[1].y}\\,if(lt(mod(t\\,480)\\,360)\\,${positions[2].y}\\,${positions[3].y})))`;

  const drawtext = `drawtext=text='ID: ${studentId}':fontcolor=white@0.55:fontsize=h*0.045:box=1:boxcolor=black@0.28:boxborderw=10:x=${xExpr}:y=${yExpr}`;

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoOnlyPath)
      .input(audioOnlyPath)
      .complexFilter([`[0:v]${drawtext}[vout]`])
      .outputOptions(["-map [vout]", "-map 1:a", "-c:v libx264", "-preset veryfast", "-crf 22", "-c:a aac", "-movflags +faststart"])
      .save(outPath)
      .on("end", resolve)
      .on("error", (err) => {
        // Xatolik bo'lsa yarim yozilgan faylni tozalash
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        reject(err);
      });
  });

  return outPath;
}

module.exports = {
  processUpload,
  generateWatermarkedVideo,
  getWatermarkedPath,
  VIDEO_DIR,
  AUDIO_DIR,
  THUMB_DIR,
  QUALITY_PRESETS,
};
