import dns from 'node:dns';
import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { initSocket } from './sockets/index.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const start = async () => {
  try {
    await connectDatabase();

    const server = http.createServer(app);

    // Initialize Socket.io
    const io = initSocket(server);
    app.set('io', io);

    server.listen(env.port, () => {
      console.info(`\n  Dunk AI Backend running on port ${env.port}`);
      console.info(`  Environment: ${env.nodeEnv}`);
      console.info(`  API docs: http://localhost:${env.port}/docs`);
      console.info(`  Health:   http://localhost:${env.port}/health\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.info('\n  SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.info('  Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.info('\n  SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.info('  Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Startup failed:', error);
    process.exitCode = 1;
  }
};

start();
