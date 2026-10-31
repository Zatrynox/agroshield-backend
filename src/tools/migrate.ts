import { loadConfig } from '../config/env.js';
import { createDb } from '../shared/db/db.js';
import { runMigrations } from '../shared/db/migrations.js';

const config = loadConfig();
const db = await createDb(config.databaseUrl);
try {
  const applied = await runMigrations(db);
  console.info(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await db.close();
}
