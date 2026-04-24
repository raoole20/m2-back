#!/bin/bash
set -e

npx prisma db seed "$@"
