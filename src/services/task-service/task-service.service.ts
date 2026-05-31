import { Injectable, Logger } from '@nestjs/common';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';
import { ScrapedPost } from '../scrapservice/scrapservice.service';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);

    constructor(
        private readonly botService: BotService,
        private readonly historyRepository: JobHistoryRepository,
        private readonly digestFormatter: JobDigestFormatter,
    ) { }

    async runScrapeJob() {
        this.logger.log('Iniciando job de scraping sequencial...');


        const providers = ["glassdoor"];
        const queries = ["desenvolvedor full-stack Júnior", "desenvolvedor full-stack pleno", "desenvolvedor front-end pleno"];
        const rawPosts: ScrapedPost[] = [];
        for (const provider of providers) {
            try {
                const posts = await this.botService.makeRequest({
                    searchQueries: queries,
                    provider: provider
                });

                if (Array.isArray(posts) && posts.length > 0) {
                    this.logger.log(`${posts.length} posts encontrados. Filtrando por heurística e antiduplicação...`);
                    rawPosts.push(...posts)

                } else {

                    this.logger.error(`Esperado um array de posts do scraping, mas recebido: ${typeof posts}.`, posts);
                    return;
                }
            }
            catch (error) {
                this.logger.error('Erro no job de scraping:', error);
            }

            const approvedJobs: ApprovedJobDto[] = [];
            const newlySentLinks: string[] = [];

            for (const post of rawPosts) {
                const text = post.text || '';
                const url = post.url || '';

                if (!text) continue;

                // 1. DEDUPLICAÇÃO: Delega a checagem ao repositório especializado
                if (url && await this.historyRepository.exists(url)) {
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
                    this.logger.debug(`❌ Rejeitada: ${result.reason} — ${text.substring(0, 60)}...`, url);
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
                await this.historyRepository.save(newlySentLinks);
            } else {
                this.logger.log('Nenhuma nova vaga aprovada passou pelos filtros nesta execução.');
            }


        }
    }
}