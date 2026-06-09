module.exports = {
  apps: [
    {
      name: "tcet-backend-api",
      cwd: "./backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        EMBED_SUBMISSION_WORKER: "false",
        SUBMISSION_WORKER_CONCURRENCY: "3",
      },
    },
    {
      name: "tcet-backend-worker",
      cwd: "./backend",
      script: "dist/worker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        SUBMISSION_WORKER_CONCURRENCY: "3",
      },
    },
    {
      name: "tcet-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "run preview -- --host 0.0.0.0 --port 5173",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
