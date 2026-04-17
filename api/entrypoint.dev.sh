#!/bin/sh
set -e

echo "[entrypoint] Generating Prisma client..."
npx prisma generate

echo "[entrypoint] Applying pending migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting NestJS in dev mode..."
exec npm run start:dev
