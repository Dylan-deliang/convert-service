# F188c：Docker Hub 国际链路劣化（003/004 卡死在拉取基础镜像）——基础镜像改走国内公开镜像站
FROM docker.1panel.live/library/node:20-slim

# F188b：云托管构建上限 10 分钟——瘦身为必须项（fonts-noto-extra 数百 MB 已删，noto-cjk 中文够用）
ARG CACHE_BUST=20261001c

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-noto-cjk \
    ca-certificates \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# F188：pdf2docx——文字层 PDF→docx 专项引擎（版式还原质量远高于 LibreOffice 的 Draw 加载路径）
# 镜像源容错链：阿里云 → 腾讯云 → 官方 PyPI（清华镜像 2026-10-01 实测 403 弃用）
RUN pip3 install --break-system-packages -i https://mirrors.aliyun.com/pypi/simple/ pdf2docx \
  || pip3 install --break-system-packages -i https://mirrors.cloud.tencent.com/pypi/simple pdf2docx \
  || pip3 install --break-system-packages pdf2docx

WORKDIR /app
COPY package.json server.js ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com && npm cache clean --force

ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
