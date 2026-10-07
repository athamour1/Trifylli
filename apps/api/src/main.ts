import 'reflect-metadata';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigToken } from './common/config/config.module';
import { corsOrigins, type AppConfig } from './common/config/configuration';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

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

async function bootstrap(): Promise<void> {
  loadDotEnv();
  // `rawBody`: το webhook του e-SEO επαληθεύει HMAC πάνω στα **ακριβή bytes** που
  // υπέγραψε ο αποστολέας, όχι σε δική μας επανασειριοποίηση του JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<AppConfig>(AppConfigToken);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.API_PREFIX);
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(helmet());
  // Χωρίς `credentials`: η αυθεντικοποίηση είναι Bearer, όχι cookies — δεν
  // υπάρχει λόγος ο browser να στέλνει credentials cross-origin.
  // `exposedHeaders`: το όνομα αρχείου των εξαγωγών (Excel) διαβάζεται από τον browser.
  app.enableCors({ origin: corsOrigins(config), exposedHeaders: ['Content-Disposition'] });

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
  app.useGlobalFilters(new PrismaExceptionFilter());
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
