#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  .env already exists. Skipping generation."
  echo "   Delete .env and re-run this script to regenerate."
  exit 0
fi

if [ ! -f "$ENV_EXAMPLE" ]; then
  echo "❌ .env.example not found at $ENV_EXAMPLE"
  exit 1
fi

generate_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
}

generate_hex_key() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

generate_api_key() {
  node -e "console.log(require('crypto').randomBytes(16).toString('hex').toUpperCase())"
}

echo "🔧 Generating .env from .env.example..."

cp "$ENV_EXAMPLE" "$ENV_FILE"

POSTGRES_PASSWORD=$(generate_secret)
JWT_SECRET=$(generate_secret)
JWT_REFRESH_SECRET=$(generate_secret)
ENCRYPTION_KEY=$(generate_hex_key)
EVOLUTION_API_KEY=$(generate_api_key)

sed -i "s|CHANGE_ME_STRONG_PASSWORD|$POSTGRES_PASSWORD|g" "$ENV_FILE"
sed -i "s|CHANGE_ME_GENERATE_SECRET|$JWT_SECRET|g" "$ENV_FILE"
sed -i "s|CHANGE_ME_GENERATE_REFRESH_SECRET|$JWT_REFRESH_SECRET|g" "$ENV_FILE"
sed -i "s|CHANGE_ME_32_BYTE_HEX_KEY|$ENCRYPTION_KEY|g" "$ENV_FILE"
sed -i "s|CHANGE_ME_GENERATE_API_KEY|$EVOLUTION_API_KEY|g" "$ENV_FILE"

echo "✅ .env generated successfully with random secrets."
echo "   Review and customize as needed: $ENV_FILE"
