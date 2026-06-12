console.log('[SafeAlert] boot', { node: process.version, port: process.env.PORT, env: process.env.NODE_ENV });
require('dotenv').config();
require('express-async-errors');

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./routes/index');
const smsService = require('./services/smsService');
const { initFirebase } = require('./config/firebase');
const notifyJobsService = require('./services/notifyJobsService');
const { seedReviewDataIfEnabled } = require('./config/seedReviewData');
const resourceService = require('./services/resourceService');
const { startMaintenanceScheduler } = require('./services/locationCleanup');
const { startDailyImportScheduler } = require('./services/scheduledImportService');
const { ensureAppSettings } = require('./config/ensureAppSettings');
const appConfig = require('./config/appConfig');
const { assertProductionEnv, isProduction } = require('./config/envValidate');
const { defaultLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

if (isProduction()) {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: appConfig.corsOrigins.length
      ? appConfig.corsOrigins
      : true,
    credentials: true,
  })
);
app.use(morgan(isProduction() ? 'combined' : 'dev'));
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      if (req.method === 'POST' && String(req.originalUrl || '').includes('/webhooks/whatsapp')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(defaultLimiter);

const publicDir = path.join(__dirname, '../public');

app.use(
  '/app',
  express.static(publicDir, {
    maxAge: isProduction() ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);
app.get('/app', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.get('/', (req, res) => res.redirect('/app/'));

// PWA icons (manifest may resolve from site root) + FCM service worker at default path
app.use('/icons', express.static(path.join(publicDir, 'icons'), { maxAge: isProduction() ? '7d' : 0 }));
app.get('/firebase-messaging-sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'firebase-messaging-sw.js'));
});
app.get('/safealert-sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'safealert-sw.js'));
});
app.use(
  '/app/vendor',
  express.static(path.join(publicDir, 'vendor'), { maxAge: isProduction() ? '30d' : 0 })
);

app.get('/health', (req, res) => {
  res.redirect(307, '/v1/health');
});

app.use('/api/v1', routes);
app.use('/v1', routes);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isProduction() ? 'An error occurred — please try again' : err.message,
  });
});

let server;

async function bootstrap() {
  if (isProduction()) {
    try {
      assertProductionEnv();
    } catch (err) {
      console.error('[Env] Production validation failed (API will still start):', err.message);
    }
  }

  initFirebase();
  await notifyJobsService.init();
  smsService.initAT();

  try {
    await ensureAppSettings();
  } catch (err) {
    console.error('[App settings] failed:', err.message);
  }

  if (!isProduction()) {
    try {
      await seedReviewDataIfEnabled();
    } catch (err) {
      console.error('[Review seed] failed:', err.message);
    }
  }

  try {
    await resourceService.seedResourcesIfEmpty();
  } catch (err) {
    console.error('[Resources seed] failed:', err.message);
  }
}

async function start() {
  try {
    const secrets = await require('./config/secretsLoader').hydrateFromSecretsManager();
    if (secrets.loaded) console.log('[SafeAlert] secrets:', secrets.source);
  } catch (err) {
    console.error('[SafeAlert] secrets load failed:', err.message);
    if (isProduction()) process.exit(1);
  }

  await new Promise((resolve, reject) => {
    server = app.listen(PORT, () => {
      console.log(`\n🛡️  SafeAlert NG API running on port ${PORT}`);
      console.log(`📱 App UI:  http://localhost:${PORT}/app/`);
      console.log(`🌍 Health:  http://localhost:${PORT}/v1/health`);
      console.log(`📋 API:     http://localhost:${PORT}/v1/zones`);
      console.log(`🔧 Mode:    ${process.env.NODE_ENV || 'development'}\n`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `\nPort ${PORT} is in use. Run: npm run kill-port\nOr: lsof -ti :${PORT} | xargs kill -9\n`
        );
        process.exit(1);
      }
      reject(err);
    });
  });

  await bootstrap();
  startMaintenanceScheduler();
  startDailyImportScheduler();

  return server;
}

function shutdown(signal) {
  if (!server) {
    process.exit(0);
    return;
  }
  console.log(`\n${signal} received — shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV === 'test') {
  module.exports = app;
  module.exports.prepare = bootstrap;
} else {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
  module.exports = app;
}
