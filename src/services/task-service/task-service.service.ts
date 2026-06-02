import { Injectable, Logger } from '@nestjs/common';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';
import { ScrapedPost, ScrapserviceService } from '../scrapservice/scrapservice.service';
import { glassdoorProvider, linkedinProvider } from '../../config/providers';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);


    constructor(
        private readonly botService: BotService,
        private readonly historyRepository: JobHistoryRepository,
        private readonly scrapeLinkedinPosts: ScrapserviceService,
        private readonly digestFormatter: JobDigestFormatter,
    ) { }

    async runScrapeJob() {
        const queries = ["desenvolvedor full-stack Júnior", "desenvolvedor full-stack pleno", "desenvolvedor front-end pleno"];

        this.logger.log('Iniciando job de scraping sequencial para todos os providers...');

        const providers = [glassdoorProvider, linkedinProvider];
        const rawPosts: ScrapedPost[] = [];

        for (const providerConfig of providers) {
            try {
                this.logger.log(`Iniciando scraping do provider: ${providerConfig.name}`);

                const posts = await this.botService.makeRequest({
                    searchQueries: queries,
                    provider: providerConfig
                });

                if (Array.isArray(posts) && posts.length > 0) {
                    this.logger.log(`[${providerConfig.name}] ${posts.length} posts coletados.`);
                    rawPosts.push(...posts);
                } else {
                    this.logger.warn(`[${providerConfig.name}] Nenhum post retornado ou formato inválido.`);
                }
            } catch (error) {
                this.logger.error(`Erro no scraping do provider ${providerConfig.name}:`, error);
            }
        }

        this.logger.log(`Total de posts brutos coletados: ${rawPosts.length}. Iniciando filtragem heurística e deduplicação...`);

        const approvedJobs: ApprovedJobDto[] = [];
        const newlySentLinks: string[] = [];

        // 2. Processamento, Deduplicação e Heurística de todas as vagas coletadas
        for (const post of rawPosts) {
            const text = post.text || '';
            const url = post.url || '';

            if (!text) continue;

            // Deduplicação: ignora vagas enviadas anteriormente
            if (url && await this.historyRepository.exists(url)) {
                this.logger.debug(`⏭️ Ignorando vaga já enviada anteriormente: ${url}`);
                continue;
            }

            // Filtragem por heurística
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

        // 3. Notificação Consolidada: Envia um único digest para o WhatsApp com tudo
        if (approvedJobs.length > 0) {
            const fullDigest = this.digestFormatter.format(approvedJobs);

            this.logger.log(`Enviando digest consolidado com ${approvedJobs.length} vagas para o WhatsApp...`);

            await this.botService.sendMessage({
                instanceName: process.env.INSTANCE_NAME!,
                number: process.env.WHATSAPP_NUMBER!,
                text: fullDigest,
                delay: 1500,
            });

            // Persiste todos os novos links de uma vez no banco
            await this.historyRepository.save(newlySentLinks);
        } else {
            this.logger.log('Nenhuma nova vaga aprovada passou pelos filtros nesta execução.');
        }

    }

    async getLinkedinPosts() {
        const queries = [
            'vaga (junior OR jr OR pleno OR pl) "react" (remoto OR "home office") -senior -sênior -lead',
            'vaga (junior OR jr OR pleno OR pl) "node" (remoto OR "home office") -senior -sênior -lead',
            'vaga (junior OR jr OR pleno OR pl) "typescript" (remoto OR "home office") -senior -sênior -lead',
            'vaga (junior OR jr OR pleno OR pl) "nestjs" (remoto OR "home office") -senior -sênior -lead',
            'vaga (junior OR jr OR pleno OR pl) "fullstack" (remoto OR "home office") -senior -sênior -lead'
        ];

        try {
            const rawPosts = await this.scrapeLinkedinPosts.scrapeLinkedinPosts(queries);
            this.logger.log(`[LinkedIn Posts] ${rawPosts.length} posts brutos obtidos do Apify.`);

            const approvedJobs: ApprovedJobDto[] = [];
            const newlySentLinks: string[] = [];

            for (const post of rawPosts) {
                const text = post.text || '';
                const url = post.url || '';

                if (!text) continue;

                // 1. Deduplicação
                if (url && await this.historyRepository.exists(url)) {
                    this.logger.debug(`⏭️ Ignorando post já enviado anteriormente: ${url}`);
                    continue;
                }

                // 2. Filtragem Heurística
                const result = await this.botService.filterJobs(text);

                if (result.shouldApply) {
                    this.logger.log(`✅ Post aprovado (score: ${result.score}): ${text.substring(0, 80)}...`);

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
                    this.logger.debug(`❌ Rejeitado: ${result.reason} — ${text.substring(0, 60)}...`, url);
                }
            }

            // 3. Notificação Consolidada
            if (approvedJobs.length > 0) {
                const fullDigest = this.digestFormatter.format(approvedJobs);
                this.logger.log(`Enviando digest consolidado com ${approvedJobs.length} posts do LinkedIn para o WhatsApp...`);

                await this.botService.sendMessage({
                    instanceName: process.env.INSTANCE_NAME!,
                    number: process.env.WHATSAPP_NUMBER!,
                    text: fullDigest,
                    delay: 1500,
                });

                // Salva os novos links enviados
                await this.historyRepository.save(newlySentLinks);
            } else {
                this.logger.log('Nenhum post novo aprovado passou pelos filtros nesta execução do LinkedIn.');
            }
        } catch (error) {
            this.logger.error('Erro na execução do pipeline do LinkedIn Posts:', error);
        }
    }
}