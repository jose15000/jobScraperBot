import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';

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
                    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                ALTER TABLE sent_jobs ADD COLUMN IF NOT EXISTS nome_vaga TEXT;
                ALTER TABLE sent_jobs DROP CONSTRAINT IF EXISTS sent_jobs_nome_vaga_key;
                CREATE INDEX IF NOT EXISTS idx_sent_jobs_url ON sent_jobs (url);
                CREATE INDEX IF NOT EXISTS idx_sent_jobs_nome_vaga ON sent_jobs (nome_vaga);
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
        const res = await this.pool.query(
          'SELECT 1 FROM sent_jobs WHERE url = $1 LIMIT 1',
          [url],
        );
        return (res.rowCount ?? 0) > 0;
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

  async save(jobs: { url: string; title: string }[]): Promise<void> {
    if (jobs.length === 0) return;

    try {
      const valuesStr = jobs
        .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
        .join(', ');
      
      const params = jobs.flatMap((job) => [job.url, job.title]);

      await this.pool.query(
        `INSERT INTO sent_jobs (url, nome_vaga) VALUES ${valuesStr} ON CONFLICT (url) DO NOTHING`,
        params,
      );
      this.logger.log(`💾 ${jobs.length} vagas persistidas no banco.`);
    } catch (error) {
      this.logger.error('Erro ao persistir vagas no banco:', error);
    }
  }
}
