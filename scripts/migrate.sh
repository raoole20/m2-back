#!/bin/bash
set -e

docker compose exec api npx prisma migrate dev "$@"
