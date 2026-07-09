# Node.js + ffmpeg birga bo'lgan production image
FROM node:20-bookworm-slim

# ffmpeg'ni o'rnatish (video/audio ajratish, watermark kuydirish uchun shart)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Upload papkalari mavjud bo'lishini ta'minlash
RUN mkdir -p uploads/videos uploads/audio uploads/thumbnails uploads/watermarked uploads/tmp

EXPOSE 5000

CMD ["node", "server.js"]
