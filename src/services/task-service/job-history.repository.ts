import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class JobHistoryRepository implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(JobHistoryRepository.name);
    private pool: Pool;

    async onModuleInit() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_CONNECTION_URI,
        });

        // Cria a tabela se não existir (idempotente)
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS sent_jobs (
                    id SERIAL PRIMARY KEY,
                    url TEXT UNIQUE NOT NULL,
                    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_sent_jobs_url ON sent_jobs (url);
            `);
            this.logger.log('✅ Tabela sent_jobs verificada/criada com sucesso.');
        } catch (error) {
            this.logger.error('Erro ao criar tabela sent_jobs:', error);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.pool?.end();
    }

    async exists(url: string): Promise<boolean> {
        if (!url) return false;

        try {
            const result = await this.pool.query(
                'SELECT 1 FROM sent_jobs WHERE url = $1 LIMIT 1',
                [url],
            );
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            this.logger.error(`Erro ao verificar URL no banco: ${url}`, error);
            return false;
        }
    }

    async save(urls: string[]): Promise<void> {
        if (urls.length === 0) return;

        try {
            // Insere todas as URLs de uma vez, ignorando duplicatas
            const values = urls.map((_, i) => `($${i + 1})`).join(', ');
            await this.pool.query(
                `INSERT INTO sent_jobs (url) VALUES ${values} ON CONFLICT (url) DO NOTHING`,
                urls,
            );
            this.logger.log(`💾 ${urls.length} URLs persistidas no banco.`);
        } catch (error) {
            this.logger.error('Erro ao persistir URLs no banco:', error);
        }
    }
}

