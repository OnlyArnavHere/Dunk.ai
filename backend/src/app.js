import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { corsOptions, generalLimiter, sanitizeMongo } from './middleware/security.js';
import { notFound, errorHandler } from './middleware/error.js';
import { send } from './utils/response.js';
import { proxyBoardArtifact } from './services/supervisor.service.js';

// Routes
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { fileRoutes } from './routes/file.routes.js';
import { documentRoutes } from './routes/document.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { billingRoutes } from './routes/billing.routes.js';
import { openapi } from './docs/openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

// Behind a load balancer (and the Next.js /api rewrite), req.ip is the proxy's
// unless this is set, and the per-IP rate limiter treats all users as one.
app.set('trust proxy', env.trustProxy);

// ---- Security & parsing middleware ----
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sanitizeMongo());

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(env.uploadDir)));

// Generated boards are written by the AI engine. When it shares this disk
// (one host, or a shared volume) the static mount above serves them; when it
// runs on its own host, they are not here, and this asks the engine instead.
app.get('/uploads/boards/*', proxyBoardArtifact);

// ---- Logging ----
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// ---- Rate limiting ----
app.use('/api/v1', generalLimiter);

// ---- Health check ----
app.get('/health', (_req, res) =>
  send(res, {
    data: {
      service: 'dunk-ai-backend',
      name: 'Dunk AI',
      version: '1.0.0',
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  })
);

// ---- API Documentation ----
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

// ---- API Routes v1 ----
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/billing', billingRoutes);

// ---- Error handling ----
app.use(notFound);
app.use(errorHandler);
