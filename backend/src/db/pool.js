import pg from 'pg';
import 'dotenv/config';

// Keep DATE columns as plain 'YYYY-MM-DD' strings instead of pg's default
// JS Date conversion, which introduces timezone-dependent off-by-one bugs.
pg.types.setTypeParser(1082, (val) => val);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
