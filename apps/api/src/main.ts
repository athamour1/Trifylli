import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigToken } from './common/config/config.module';
import { corsOrigins, loadConfig, logFormat, type AppConfig } from './common/config/configuration';
import { AppExceptionFilter } from './common/errors/app-exception.filter';
import { initErrorReporting } from './common/errors/error-reporting';
import { AppLogger } from './common/logging/app-logger';
import { requestLogging } from './common/logging/request-logging.middleware';

/**
 * Ρητή φόρτωση `.env` πριν από οτιδήποτε άλλο.
 *
 * Σε container οι μεταβλητές έρχονται από το περιβάλλον και το αρχείο λείπει —
 * η απουσία του δεν είναι σφάλμα. Οι ήδη ορισμένες μεταβλητές δεν
 * αντικαθίστανται από το αρχείο.
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(resolve(__dirname, '..', '.env'));
  } catch {
    // Δεν υπάρχει .env — αναμενόμενο σε production.
  }
}

/** Η έκδοση του API (το `release.sh` τη γράφει στο package.json) — το «release» στο error tracking. */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

async function bootstrap(): Promise<void> {
  loadDotEnv();
  // Πριν από οτιδήποτε άλλο, ώστε να πιάνει και σφάλματα της εκκίνησης.
  const early = loadConfig();
  initErrorReporting({
    dsn: early.SENTRY_DSN,
    environment: early.SENTRY_ENVIRONMENT ?? early.NODE_ENV,
    release: `trifylli-api@${appVersion()}`,
  });
  // `rawBody`: το webhook του e-SEO επαληθεύει HMAC πάνω στα **ακριβή bytes** που
  // υπέγραψε ο αποστολέας, όχι σε δική μας επανασειριοποίηση του JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<AppConfig>(AppConfigToken);
  // JSON στην παραγωγή (με requestId σε κάθε γραμμή μέσα σε αίτημα). Τα logs της
  // εκκίνησης ήταν buffered (`bufferLogs`) και βγαίνουν κι αυτά σε αυτή τη μορφή.
  app.useLogger(new AppLogger({ json: logFormat(config) === 'json' }));
  const logger = new Logger('Bootstrap');

  // Τα έντυπα των δράσεων στέλνουν την υπογραφή ως εικόνα (data URL) — το
  // προεπιλεγμένο όριο των 100 KB δεν φτάνει. Το `rawBody` παραμένει για το webhook.
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix(config.API_PREFIX);
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLogging(config.API_PREFIX));
  // Χωρίς `credentials`: η αυθεντικοποίηση είναι Bearer, όχι cookies — δεν
  // υπάρχει λόγος ο browser να στέλνει credentials cross-origin.
  // `exposedHeaders`: το όνομα αρχείου των εξαγωγών (Excel) διαβάζεται από τον browser.
  // `X-Request-Id`: η PWA το κρατά για το error tracking και για αναφορές προβλημάτων.
  app.enableCors({ origin: corsOrigins(config), exposedHeaders: ['Content-Disposition', 'X-Request-Id'] });

  // Το API σερβίρει δυναμικά δεδομένα — όχι HTTP caching. Χωρίς αυτό, ο browser
  // κρατά παλιές απαντήσεις (ETag → 304) και οι λίστες «κολλάνε» μετά από
  // αλλαγές (π.χ. νέο/διαγραμμένο μέλος). Η offline λειτουργία καλύπτεται από
  // τον service worker + το cache του `useAsyncData`, όχι από το HTTP cache.
  app.getHttpAdapter().getInstance().set('etag', false);
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Άγνωστο πεδίο στο body σημαίνει σχεδόν πάντα λάθος έκδοση client:
      // καλύτερα ρητό 400 από σιωπηλή αγνόηση.
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter(app.getHttpAdapter()));
  app.enableShutdownHooks();

  const swaggerEnabled = config.SWAGGER_ENABLED ?? config.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const swagger = new DocumentBuilder()
      .setTitle('Trifylli API')
      .setDescription('Σύστημα διαχείρισης Τοπικού Τμήματος Σ.Ε.Ο.')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup(`${config.API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(config.PORT, '0.0.0.0');

  logger.log(`API: http://localhost:${config.PORT}/${config.API_PREFIX}`);
  if (swaggerEnabled) logger.log(`Swagger: http://localhost:${config.PORT}/${config.API_PREFIX}/docs`);
  if (config.TRUST_PROXY_HOPS > 0) logger.log(`Εμπιστεύεται ${config.TRUST_PROXY_HOPS} proxy hop(s) για την IP πελάτη.`);
  if (config.DEV_AUTH_BYPASS) {
    logger.warn(`Auth bypass ενεργό ως: ${config.DEV_AUTH_EMAIL} (header x-dev-email για αλλαγή)`);
  }
}

void bootstrap();
