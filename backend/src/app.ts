import { AnalyticsService } from './analytics';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
export function configureApp(app: INestApplication, origins: string[]) {
  app.setGlobalPrefix('api/v1');
  const analytics=app.get(AnalyticsService);
  app.use((req:{url:string},res:{statusCode:number;on:(name:string,fn:()=>void)=>void},next:()=>void)=>{const started=performance.now();if(req.url.startsWith('/api/v1/')&&!req.url.startsWith('/api/v1/health')&&!req.url.startsWith('/api/v1/stats/collect'))res.on('finish',()=>analytics.recordApi(res.statusCode,performance.now()-started));next();});
  app.use(helmet());
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.enableCors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();
}
