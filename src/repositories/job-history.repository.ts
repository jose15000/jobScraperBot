import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';

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

  async onModuleInit() {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || process.env.DATABASE_CONNECTION_URI,
    });

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
      this.logger.log('✅ Tabela sent_jobs verificada/criada com sucesso.');
    } catch (error) {
      this.logger.error('Erro ao criar/atualizar tabela sent_jobs:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async existsExactUrl(url: string): Promise<boolean> {
    if (!url) return false;
    try {
      const res = await this.pool.query(
        'SELECT 1 FROM sent_jobs WHERE url = $1 LIMIT 1',
        [url],
      );
      return (res.rowCount ?? 0) > 0;
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
      const res = await this.pool.query(
        `SELECT id, url, nome_vaga AS title, company, sent_at 
         FROM sent_jobs 
         WHERE sent_at >= NOW() - ($1 || ' days')::INTERVAL
         ORDER BY sent_at DESC 
         LIMIT $2`,
        [days, limit],
      );
      return res.rows.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title || '',
        company: row.company || '',
        sent_at: row.sent_at,
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
        const res = await this.pool.query(
          'SELECT 1 FROM sent_jobs WHERE url = $1 OR nome_vaga = $2 LIMIT 1',
          [url, title],
        );
        return (res.rowCount ?? 0) > 0;
      } else if (url) {
        return this.existsExactUrl(url);
      } else if (title) {
        const res = await this.pool.query(
          'SELECT 1 FROM sent_jobs WHERE nome_vaga = $1 LIMIT 1',
          [title],
        );
        return (res.rowCount ?? 0) > 0;
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
      const res = await this.pool.query(
        `SELECT 1 FROM sent_jobs 
         WHERE LOWER(TRIM(nome_vaga)) = LOWER(TRIM($1))
           AND (
             ($2 = '' AND (company IS NULL OR company = ''))
             OR LOWER(TRIM(company)) = LOWER(TRIM($2))
           )
         LIMIT 1`,
        [title, company || ''],
      );
      return (res.rowCount ?? 0) > 0;
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
      const valuesStr = jobs
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(', ');

      const params = jobs.flatMap((job) => [
        job.url,
        job.title,
        job.company || '',
      ]);

      await this.pool.query(
        `INSERT INTO sent_jobs (url, nome_vaga, company) VALUES ${valuesStr} 
         ON CONFLICT (url) DO UPDATE SET 
            nome_vaga = EXCLUDED.nome_vaga,
            company = CASE WHEN EXCLUDED.company <> '' THEN EXCLUDED.company ELSE sent_jobs.company END`,
        params,
      );
      this.logger.log(`💾 ${jobs.length} vagas persistidas no banco.`);
    } catch (error) {
      this.logger.error('Erro ao persistir vagas no banco:', error);
    }
  }
}
