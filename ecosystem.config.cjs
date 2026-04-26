module.exports = {
  apps: [
    {
      name: 'sefaz-proxy',
      script: 'api/sefaz-proxy.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/sefaz-proxy-error.log',
      out_file: './logs/sefaz-proxy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'evolution-worker',
      script: 'npm',
      args: 'run worker:evolution',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/evolution-worker-error.log',
      out_file: './logs/evolution-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
