import { loadConfig } from './config/env.js';
import { createDb } from './shared/db/db.js';
import { runMigrations } from './shared/db/migrations.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDb(config.databaseUrl);

  if (config.autoMigrate) {
    const applied = await runMigrations(db);
    if (applied.length > 0) {
      console.info(`Applied migrations: ${applied.join(', ')}`);
    }
  }

  const app = await buildApp({ config, db });
  await app.listen({ port: config.apiPort, host: config.apiHost });
  app.log.info(
    { port: config.apiPort, demoMode: config.demoMode, docs: config.enableApiDocs },
    'agroshield_api_started',
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting_down');
    await app.close();
    await db.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Failed to start AgroShield API', error);
  process.exit(1);
});
