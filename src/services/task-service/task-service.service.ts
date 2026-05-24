import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from './job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);

    constructor(
        private readonly botService: BotService,
        private readonly historyRepository: JobHistoryRepository,
        private readonly digestFormatter: JobDigestFormatter,
    ) { }

    @Cron(CronExpression.EVERY_MINUTE)
    async runScrapeJob() {
        this.logger.log('Iniciando job de scraping sequencial...');

        try {
            const posts = await this.botService.makeRequest({
                searchQueries: ["\"vaga\" and \"react\" and \"junior\" and \"remoto\""],
            });

            if (!Array.isArray(posts)) {
                this.logger.error(`Esperado um array de posts do Apify, mas recebido: ${typeof posts}. Verifique a URL do APIFY_URL.`);
                return;
            }

            if (posts.length === 0) {
                this.logger.log('Nenhum post encontrado nesta execução.');
                return;
            }

            this.logger.log(`${posts.length} posts encontrados. Filtrando por heurística e antiduplicação...`);

            const approvedJobs: ApprovedJobDto[] = [];
            const newlySentLinks: string[] = [];

            for (const post of posts) {
                const text = post.content || post.text || post.description || '';
                const url = post.linkedinUrl || post.url || '';

                if (!text) continue;

                // 1. DEDUPLICAÇÃO: Delega a checagem ao repositório especializado
                if (url && this.historyRepository.exists(url)) {
                    this.logger.debug(`⏭️ Ignorando vaga já enviada anteriormente: ${url}`);
                    continue;
                }

                // 2. HEURÍSTICA: Delega a filtragem de negócio ao botService/heuristics
                const result = await this.botService.filterJobs(text);

                if (result.shouldApply) {
                    this.logger.log(`✅ Vaga aprovada (score: ${result.score}): ${text.substring(0, 80)}...`);

                    approvedJobs.push({
                        score: result.score,
                        reason: result.reason,
                        url,
                        previewText: text.substring(0, 150).replace(/\n/g, ' ').trim()
                    });

                    if (url) {
                        newlySentLinks.push(url);
                    }
                } else {
                    this.logger.debug(`❌ Rejeitada: ${result.reason} — ${text.substring(0, 60)}...`);
                }
            }

            // 3. APRESENTAÇÃO & NOTIFICAÇÃO: Se houver vagas novas aprovadas, formata e envia
            if (approvedJobs.length > 0) {
                // Formata o digest usando o formatador especializado
                const fullDigest = this.digestFormatter.format(approvedJobs);

                this.logger.log(`Enviando digest consolidado com ${approvedJobs.length} vagas para o WhatsApp...`);

                await this.botService.sendMessage({
                    instanceName: 'job-bot',
                    number: process.env.WHATSAPP_NUMBER!,
                    text: fullDigest,
                    delay: 1500,
                });

                // Persiste os novos links no repositório especializado
                this.historyRepository.save(newlySentLinks);
            } else {
                this.logger.log('Nenhuma nova vaga aprovada passou pelos filtros nesta execução.');
            }
        }
        catch (error) {
            this.logger.error('Erro no job de scraping:', error);
        }
    }
}