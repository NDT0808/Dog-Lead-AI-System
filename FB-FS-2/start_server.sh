#!/usr/bin/env bash
# Pet Lead AI — Server Start Script for Linux VPS
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT=${1:-8001}
echo "🐾 Khởi động Pet Lead Server trên cổng $PORT..."

if command -v pm2 &> /dev/null; then
    pm2 start ecosystem.config.cjs
    pm2 save
    echo "✅ Đã khởi chạy Server với PM2!"
else
    node server.mjs "$PORT"
fi
