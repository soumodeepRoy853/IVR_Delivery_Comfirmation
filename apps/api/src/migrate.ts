import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from './db';

function findSchema(): string {
  const candidates = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../src/schema.sql'),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // try next location
    }
  }
  throw new Error('Could not locate schema.sql');
}

async function main(): Promise<void> {
  await pool.query(findSchema());
  console.log('Database schema applied successfully.');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
