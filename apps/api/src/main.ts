import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { loadEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const adapter = new FastifyAdapter({
    trustProxy: environment.trustedProxyRanges === false ? false : [...environment.trustedProxyRanges],
    genReqId: (request: IncomingMessage) => {
      const candidate = request.headers['x-correlation-id'];
      const value = Array.isArray(candidate) ? candidate[0] : candidate;
      return value && isUuidV4(value) ? value : randomUUID();
    },
    logger: {
      level: environment.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', '*.password', '*.token'],
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: false });

  await app.register(helmet, environment.nodeEnv === 'production' ? {} : { contentSecurityPolicy: false });
  app.enableCors({
    origin: (origin, callback) => callback(null, !origin || environment.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ledgerly Accounting API')
    .setDescription('Versioned, tenant-scoped financial API. Monetary values are decimal strings.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'opaque' })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.openapi = '3.1.0';
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });

  await app.listen(environment.port, environment.host);
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

void bootstrap();
