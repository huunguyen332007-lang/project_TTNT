# syntax=docker/dockerfile:1

# ---- Giai đoạn 1: cài dependency production ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Ưu tiên cài đúng phiên bản đã khóa; lockfile thiếu/lệch thì rơi về npm install (nên commit package-lock.json).
RUN npm ci --omit=dev || npm install --omit=dev

# ---- Giai đoạn 2: image chạy thật ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# tini làm PID 1: chuyển tín hiệu SIGTERM đúng cách và dọn tiến trình con.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
