# file_management_backend/Dockerfile
# 默认 target=api（轻量、构建快）；预览 Worker 用 --target worker
# 国内拉取 node 镜像慢时可：docker build --build-arg NODE_IMAGE=node:20-bookworm-slim .

ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim

# ---------- 1. 基础镜像（openssl 供 Prisma；国内 apt 源） ----------
FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate

# ---------- 2. 安装依赖 ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------- 3. 编译 TypeScript ----------
FROM deps AS build
COPY . .
RUN pnpm build

# ---------- 4. 运行基础层（api / worker 共用） ----------
FROM base AS runtime-base
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# 安装阶段不能设 NODE_ENV=production，否则 pnpm add --save-dev 会被跳过
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  && pnpm add prisma@5.22.0 --save-dev \
  && pnpm exec prisma generate
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads previews

# ---------- 5a. API（无 LibreOffice，构建快） ----------
FROM runtime-base AS api
EXPOSE 3000
CMD ["node", "dist/app.js"]

# ---------- 5b. Worker（含 LibreOffice，仅预览转码需要） ----------
FROM runtime-base AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libreoffice-writer libreoffice-impress libreoffice-core \
  && rm -rf /var/lib/apt/lists/*
CMD ["node", "dist/workers/preview.worker.js"]
