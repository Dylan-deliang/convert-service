FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-noto-cjk \
    fonts-noto-extra \
    ca-certificates \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# F188：pdf2docx——文字层 PDF→docx 专项引擎（版式还原质量远高于 LibreOffice 的 Draw 加载路径）
RUN pip3 install --break-system-packages -i https://pypi.tuna.tsinghua.edu.cn/simple pdf2docx

WORKDIR /app
COPY package.json server.js ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com

ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
