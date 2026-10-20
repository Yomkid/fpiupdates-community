import {hostFrontend} from './frontend-host';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './app';
import { loadConfig } from './config';
async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1||hops>5)throw new Error('Invalid trusted proxy hop count');app.getHttpAdapter().getInstance().set('trust proxy',hops);}
  app.use(json({ limit: '128kb' }));
  configureApp(app, config.origins);
  hostFrontend(app);
  await app.listen(config.port, '0.0.0.0');
}
bootstrap().catch((error:unknown) => { console.error(error && typeof error==='object' && 'code' in error && error.code==='EADDRINUSE' ? 'API port is already in use. Stop the older FpiUpdates terminal with Ctrl+C.' : 'API startup failed. Check database connectivity and configuration.'); process.exitCode = 1; });
