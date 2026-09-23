const path = require('path');

module.exports = {
  apps: [
    {
      name: 'flash-sales-backend',
      script: 'src/server.js',
      cwd: path.join(__dirname, 'backend'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 6002
      }
    },
    {
      name: 'flash-sales-frontend',
      script: 'server.js',
      cwd: path.join(__dirname, 'frontend'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 6001
      }
    },
    {
      name: 'pub400-watchdog',
      script: 'watchdog.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    }
  ]
};
