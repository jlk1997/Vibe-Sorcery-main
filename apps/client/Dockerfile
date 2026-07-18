FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/client/package.json ./apps/client/
COPY packages/ ./packages/
WORKDIR /app/apps/client
COPY apps/client/ ./
ARG TARO_APP_API_URL=/api/v1
ENV TARO_APP_API_URL=$TARO_APP_API_URL
RUN npm install --legacy-peer-deps 2>/dev/null || npm install
RUN npm run build:h5

FROM nginx:alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist-h5 /usr/share/nginx/html
EXPOSE 80
