import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, and, gte, desc, sql, isNull } from 'drizzle-orm';
import { sentJobs } from '../database/schema';

export interface StoredJobRecord {
  id?: number;
  url: string;
  title: string;
  company?: string;
  sent_at?: Date;
}

@Injectable()
export class JobHistoryRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobHistoryRepository.name);
  private pool: Pool;
  private db: NodePgDatabase<{ sentJobs: typeof sentJobs }>;

  async onModuleInit() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || process.env.DATABASE_CONNECTION_URI,
    });

    this.db = drizzle(this.pool, { schema: { sentJobs } });

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS sent_jobs (
            id SERIAL PRIMARY KEY,
            url TEXT UNIQUE NOT NULL,
            nome_vaga TEXT,
            company TEXT,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        ALTER TABLE sent_jobs ADD COLUMN IF NOT EXISTS nome_vaga TEXT;
        ALTER TABLE sent_jobs ADD COLUMN IF NOT EXISTS company TEXT;
        ALTER TABLE sent_jobs DROP CONSTRAINT IF EXISTS sent_jobs_nome_vaga_key;
        CREATE INDEX IF NOT EXISTS idx_sent_jobs_url ON sent_jobs (url);
        CREATE INDEX IF NOT EXISTS idx_sent_jobs_nome_vaga ON sent_jobs (nome_vaga);
        CREATE INDEX IF NOT EXISTS idx_sent_jobs_company ON sent_jobs (company);
        CREATE INDEX IF NOT EXISTS idx_sent_jobs_sent_at ON sent_jobs (sent_at);
      `);
      this.logger.log('✅ Drizzle ORM conectado e tabela sent_jobs verificada.');
    } catch (error) {
      this.logger.error('Erro ao conectar ou criar tabela sent_jobs:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async existsExactUrl(url: string): Promise<boolean> {
    if (!url) return false;
    try {
      const res = await this.db
        .select({ id: sentJobs.id })
        .from(sentJobs)
        .where(eq(sentJobs.url, url))
        .limit(1);

      return res.length > 0;
    } catch (error) {
      this.logger.error(`Erro ao verificar URL no banco (${url}):`, error);
      return false;
    }
  }

  async getRecentJobs(
    limit: number = 60,
    days: number = 30,
  ): Promise<StoredJobRecord[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const rows = await this.db
        .select({
          id: sentJobs.id,
          url: sentJobs.url,
          title: sentJobs.nome_vaga,
          company: sentJobs.company,
          sent_at: sentJobs.sent_at,
        })
        .from(sentJobs)
        .where(gte(sentJobs.sent_at, cutoffDate))
        .orderBy(desc(sentJobs.sent_at))
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title || '',
        company: row.company || '',
        sent_at: row.sent_at || undefined,
      }));
    } catch (error) {
      this.logger.error('Erro ao buscar histórico recente de vagas:', error);
      return [];
    }
  }

  async exists(url: string, title: string): Promise<boolean> {
    if (!url && !title) return false;

    try {
      if (url && title) {
        const res = await this.db
          .select({ id: sentJobs.id })
          .from(sentJobs)
          .where(or(eq(sentJobs.url, url), eq(sentJobs.nome_vaga, title)))
          .limit(1);

        return res.length > 0;
      } else if (url) {
        return this.existsExactUrl(url);
      } else if (title) {
        const res = await this.db
          .select({ id: sentJobs.id })
          .from(sentJobs)
          .where(eq(sentJobs.nome_vaga, title))
          .limit(1);

        return res.length > 0;
      }
      return false;
    } catch (error) {
      this.logger.error(
        `Erro ao verificar vaga no banco (url: ${url}, title: ${title}):`,
        error,
      );
      return false;
    }
  }

  async existsByTitleAndCompany(
    title: string,
    company?: string,
  ): Promise<boolean> {
    if (!title) return false;

    try {
      const normalizedTitle = title.trim().toLowerCase();
      const normalizedCompany = (company || '').trim().toLowerCase();

      const condition = normalizedCompany
        ? and(
            sql`LOWER(TRIM(${sentJobs.nome_vaga})) = ${normalizedTitle}`,
            sql`LOWER(TRIM(${sentJobs.company})) = ${normalizedCompany}`,
          )
        : and(
            sql`LOWER(TRIM(${sentJobs.nome_vaga})) = ${normalizedTitle}`,
            or(
              isNull(sentJobs.company),
              eq(sentJobs.company, ''),
              sql`TRIM(${sentJobs.company}) = ''`,
            ),
          );

      const res = await this.db
        .select({ id: sentJobs.id })
        .from(sentJobs)
        .where(condition)
        .limit(1);

      return res.length > 0;
    } catch (error) {
      this.logger.error(
        `Erro ao verificar título e empresa no banco (${title} / ${company}):`,
        error,
      );
      return false;
    }
  }

  async save(
    jobs: { url: string; title: string; company?: string }[],
  ): Promise<void> {
    if (jobs.length === 0) return;

    try {
      const values = jobs.map((job) => ({
        url: job.url,
        nome_vaga: job.title,
        company: job.company || '',
      }));

      await this.db
        .insert(sentJobs)
        .values(values)
        .onConflictDoUpdate({
          target: sentJobs.url,
          set: {
            nome_vaga: sql`EXCLUDED.nome_vaga`,
            company: sql`CASE WHEN EXCLUDED.company <> '' THEN EXCLUDED.company ELSE sent_jobs.company END`,
          },
        });

      this.logger.log(`💾 ${jobs.length} vagas persistidas no banco com Drizzle.`);
    } catch (error) {
      this.logger.error('Erro ao persistir vagas no banco com Drizzle:', error);
    }
  }
}
