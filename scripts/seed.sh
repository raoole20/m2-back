#!/bin/bash
set -e

docker compose exec api npx prisma db seed "$@"
