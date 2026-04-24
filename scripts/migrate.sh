#!/bin/bash
set -e

npx prisma migrate dev "$@"
