FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-noto-cjk \
    fonts-noto-extra \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json server.js ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com

ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
