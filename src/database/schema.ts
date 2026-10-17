import { pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';

export const sentJobs = pgTable(
  'sent_jobs',
  {
    id: serial('id').primaryKey(),
    url: text('url').notNull().unique(),
    nome_vaga: text('nome_vaga'),
    company: text('company'),
    sent_at: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_sent_jobs_url').on(table.url),
    index('idx_sent_jobs_nome_vaga').on(table.nome_vaga),
    index('idx_sent_jobs_company').on(table.company),
    index('idx_sent_jobs_sent_at').on(table.sent_at),
  ],
);

export type SentJob = typeof sentJobs.$inferSelect;
export type NewSentJob = typeof sentJobs.$inferInsert;
