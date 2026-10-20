export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 3000);
  const poolMax = Number(env.DB_POOL_MAX ?? 3);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) throw new Error('DB_POOL_MAX must be between 1 and 20');
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  const origins = (env.FRONTEND_ORIGINS ?? 'http://localhost:5173').split(',').map(x => x.trim());
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('FRONTEND_ORIGINS must contain exact HTTP origins');
    if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('Production frontend origins must use HTTPS');
  }
  return { port, poolMax, origins, databaseUrl: env.DATABASE_URL };
}

// Prisma's pg timestamp normalizer expects UTC session output. Preserve other
// connection options and force the final timezone setting for every pool client.
export function utcDatabaseUrl(value:string){const url=new URL(value);url.searchParams.set('options',[url.searchParams.get('options'),'-c timezone=UTC'].filter(Boolean).join(' '));return url.toString();}
