# file_management_backend_nest/Dockerfile
ARG NODE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime-base
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  && pnpm add prisma@5.22.0 --save-dev \
  && pnpm exec prisma generate
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads previews

FROM runtime-base AS api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]

FROM runtime-base AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libreoffice-writer libreoffice-impress libreoffice-core \
  && rm -rf /var/lib/apt/lists/*
CMD ["node", "dist/worker.main.js"]
