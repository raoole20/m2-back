FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# =====================================================
# DEVELOPMENT — Hot-reload target
# =====================================================
FROM base AS development

COPY . .

COPY docker/api/entrypoint.dev.sh /usr/local/bin/entrypoint.dev.sh
RUN chmod +x /usr/local/bin/entrypoint.dev.sh

EXPOSE 3000
ENTRYPOINT ["entrypoint.dev.sh"]

# =====================================================
# BUILD — Compile TypeScript
# =====================================================
FROM base AS build

COPY . .
RUN npx prisma generate
RUN pnpm run build

# =====================================================
# PRODUCTION — Minimal runtime image
# =====================================================
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main.js"]
