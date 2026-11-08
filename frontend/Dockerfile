# syntax=docker/dockerfile:1

# ---- Build static bằng Vite ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Ưu tiên cài đúng phiên bản đã khóa (npm ci). Nếu lockfile thiếu hoặc lệch package.json thì
# rơi về npm install để build không bị chặn. Hãy chạy `npm install` rồi commit package-lock.json.
RUN npm ci || npm install
COPY . .
# Mặc định rỗng = gọi /api cùng domain (nginx sẽ chuyển tiếp tới backend).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Phục vụ bằng nginx ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=3s --retries=3 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
