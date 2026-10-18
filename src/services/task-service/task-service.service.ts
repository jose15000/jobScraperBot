import { Injectable, Logger } from '@nestjs/common';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';
import {
  glassdoorProvider,
  linkedinProvider,
  remotarProvider,
} from '../../config/providers';
import { LinkedinApifyService } from '../Linkedin/linkedin-apify.service';
import { ScrapedPost } from 'src/interfaces/ScrapedPost/iscrapedpost.interface';
import { ILocationOption } from 'src/interfaces/isearch/isearch.interface';

import { JevService } from '../jev/jev.service';
import { JobDeduplicationService } from '../../utils/deduplication';
import { JobConfigService } from '../../config/job-config.service';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly botService: BotService,
    private readonly jevService: JevService,
    private readonly historyRepository: JobHistoryRepository,
    private readonly scrapeLinkedinPosts: LinkedinApifyService,
    private readonly digestFormatter: JobDigestFormatter,
    private readonly jobDeduplicationService: JobDeduplicationService,
    private readonly jobConfigService: JobConfigService,
  ) { }

  async runScrapeJob() {
    const queries = this.jobConfigService.getQueries();
    const locations = this.jobConfigService.getLocations();
    const userProfile = this.jobConfigService.getUserProfile();

    this.logger.log('🚀 Iniciando pipeline consolidado de busca de vagas...');
    this.logger.log(
      `🔍 Queries configuradas (${queries.length}): ${queries.join(', ')}`,
    );
    const webScrapedPosts = await this.scrapeWebProviders(queries, locations);

    // 2. Unifica todos os posts brutos
    const rawPosts = [...webScrapedPosts];
    this.logger.log(
      `Total de posts brutos coletados: ${rawPosts.length}. Carregando histórico do banco e iniciando filtragem...`,
    );

    // Carrega histórico recente para deduplicação por título e empresa
    const recentStoredJobs = await this.historyRepository.getRecentJobs(300, 30);
    this.logger.log(
      `📚 ${recentStoredJobs.length} vagas recentes carregadas do banco para checagem de duplicatas.`,
    );

    // Inicializa conjunto de chaves únicas (título + empresa) com base no banco
    const seenJobKeys = this.jobDeduplicationService.createKeySet(recentStoredJobs);

    const approvedJobs: ApprovedJobDto[] = [];
    const newlySentJobs: { url: string; title: string; company?: string }[] = [];

    // 3. Processamento, Deduplicação (Título + Empresa) e Heurística com Jev
    for (const post of rawPosts) {
      const text = post.text || '';
      let url = post.url || '';

      // Extração robusta de title e company
      let title = post.title?.trim() || '';
      let company = post.company?.trim() || '';

      // Fallback para caso o post venha apenas com text formatado "Vaga: ... | Empresa: ..."
      if (!title && text) {
        const textMatch = text.match(/Vaga:\s*(.*?)(?:\s*\|\s*Empresa:\s*(.*))?$/i);
        if (textMatch) {
          title = textMatch[1]?.trim() || '';
          if (!company && textMatch[2]) {
            company = textMatch[2]?.trim() || '';
          }
        }
      }

      if (!title) {
        title =
          text.split('\n')[0].replace(/[#*•-]/g, '').trim().substring(0, 100) ||
          'Desenvolvedor';
      }

      // Se o título ainda contiver o prefixo "Vaga: ... | Empresa: ..."
      const titleMatch = title.match(/^Vaga:\s*(.*?)(?:\s*\|\s*Empresa:\s*(.*))?$/i);
      if (titleMatch) {
        title = titleMatch[1]?.trim() || title;
        if (!company && titleMatch[2]) {
          company = titleMatch[2]?.trim() || '';
        }
      }

      // Limpa ratings/avaliações residuais no nome da empresa (ex: Decathlon3,9 -> Decathlon)
      if (company) {
        company = company.replace(/\d+([.,]\d+)?\s*$/, '').trim();
      }

      if (!text) continue;

      if (!url) {
        const hash = Buffer.from(text)
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 50);
        url = `urn:job-hash:${hash}`;
      }

      // Deduplicação pelo Título da Vaga e Empresa (não pelo link)
      if (
        this.jobDeduplicationService.isDuplicate(
          { title, company },
          seenJobKeys,
        )
      ) {
        this.logger.debug(
          `⏭️ Vaga descartada como duplicata (título + empresa já vistos): "${title}" | Empresa: "${company || 'Não informada'}"`,
        );
        continue;
      }

      // Registra a chave para evitar repetições no mesmo ciclo de execução
      seenJobKeys.add(this.jobDeduplicationService.createKey(title, company));

      // 3. Filtragem e Avaliação de Fit com o Jev
      const result = await this.jevService.evaluateJob(
        {
          title,
          text,
          company,
          location: post.location,
          url,
        },
        userProfile,
      );

      if (result.shouldApply) {
        this.logger.log(
          `✅ Vaga aprovada (score: ${result.score}): ${title} ${company ? `(${company})` : ''}`,
        );
        approvedJobs.push({
          score: result.score,
          reason: result.reason,
          url,
          previewText: text.substring(0, 150).replace(/\n/g, ' ').trim(),
        });

        const newJobRecord = { url, title, company };
        newlySentJobs.push(newJobRecord);
        recentStoredJobs.unshift(newJobRecord);
      } else {
        this.logger.debug(
          `❌ Rejeitada: ${result.reason} — ${title}`,
          url,
        );
      }
    }

    if (approvedJobs.length > 0) {
      const fullDigest = this.digestFormatter.format(approvedJobs);

      this.logger.log(
        `Enviando digest consolidado com ${approvedJobs.length} vagas para o WhatsApp...`,
      );

      await this.botService.sendMessage({
        instanceName: process.env.INSTANCE_NAME!,
        number: process.env.WHATSAPP_NUMBER!,
        text: fullDigest,
        delay: 1500,
      });

      await this.historyRepository.save(newlySentJobs);
    } else {
      this.logger.log(
        'Nenhuma nova vaga aprovada passou pelos filtros nesta execução.',
      );
    }
  }

  private async scrapeWebProviders(
    queries: string[],
    locations: ILocationOption[],
  ): Promise<ScrapedPost[]> {
    const providers = [
      glassdoorProvider,
      linkedinProvider,
      remotarProvider,
    ];
    const results: ScrapedPost[] = [];
    const seenLinks = new Set<string>();
    for (const providerConfig of providers) {
      try {
        this.logger.log(
          `Iniciando scraping do provider: ${providerConfig.name}`,
        );
        const posts = await this.botService.makeRequest({
          searchQueries: queries,
          location: locations,
          provider: providerConfig,
        });

        if (Array.isArray(posts) && posts.length > 0) {
          this.logger.log(
            `[${providerConfig.name}] ${posts.length} posts coletados.`,
          );
          results.push(...posts);
        } else {
          this.logger.warn(
            `[${providerConfig.name}] Nenhum post retornado ou formato inválido.`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Erro no scraping do provider ${providerConfig.name}:`,
          error,
        );
      }
    }

    return results;
  }

  private async scrapeLinkedinFeed(queries: string[]): Promise<ScrapedPost[]> {
    try {
      this.logger.log(
        'Iniciando busca de posts informais no LinkedIn via Apify...',
      );
      const posts = await this.scrapeLinkedinPosts.scrapeLinkedinPosts(queries);

      if (Array.isArray(posts) && posts.length > 0) {
        this.logger.log(`[Apify LinkedIn] ${posts.length} posts coletados.`);
        return posts;
      }
    } catch (error) {
      this.logger.error(
        'Erro ao buscar posts informais do LinkedIn via Apify:',
        error,
      );
    }
    return [];
  }
}
