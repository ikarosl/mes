import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadAppConfig } from './config/env.js';
const config = loadAppConfig();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
