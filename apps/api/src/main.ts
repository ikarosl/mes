import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadAppConfig } from './config/env.js';
import { createValidationPipe } from './presentation/http/validation.pipe.js';
import { requestContextMiddleware } from './common/http/request-context.middleware.js';
const config = loadAppConfig();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
if (config.trustProxyHops > 0)
  (
    app.getHttpAdapter().getInstance() as {
      set(name: string, value: unknown): void;
    }
  ).set('trust proxy', config.trustProxyHops);
app.setGlobalPrefix('api');
app.use(requestContextMiddleware);
app.useGlobalPipes(createValidationPipe());
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
