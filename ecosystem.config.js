// PM2 Configuration for Crypto4Pro
module.exports = {
  apps: [
    {
      name: 'crypto4pro',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/var/www/crypto4pro',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
