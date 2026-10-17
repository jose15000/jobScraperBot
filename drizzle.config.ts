import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.DATABASE_CONNECTION_URI || 'postgresql://postgres:PASSWORD@localhost:5432/postgres?schema=public',
  },
});
