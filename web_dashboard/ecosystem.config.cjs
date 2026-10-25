/**
 * 🐾 Pet Lead AI — PM2 Ecosystem Configuration for VPS Deployment
 * Quản lý tiến trình Node.js Server tự động, restart nếu lỗi, giới hạn RAM 600M
 * 
 * Lệnh chạy trên VPS:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'pet-lead-server',
      script: './server.mjs',
      args: '8001',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 8001
      },
      error_file: './data/pm2_error.log',
      out_file: './data/pm2_out.log',
      time: true
    }
  ]
};
