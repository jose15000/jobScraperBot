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
import { IProviderConfig, ILocationOption } from 'src/interfaces/isearch/isearch.interface';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly botService: BotService,
    private readonly historyRepository: JobHistoryRepository,
    private readonly scrapeLinkedinPosts: LinkedinApifyService,
    private readonly digestFormatter: JobDigestFormatter,
  ) { }

  async runScrapeJob() {
    const queries = [
      'desenvolvedor full-stack Júnior',
      'desenvolvedor full-stack pleno',
      'desenvolvedor front-end pleno',
      `vaga(junior OR jr OR pleno)(React OR Node OR TypeScript) Curitiba - sênior - senior - lead`,
      `vaga(desenvolvedor OR developer)(IA OR "inteligência artificial" OR LLM OR AI) Curitiba(React OR Python OR Node)`,
      `(hiring OR contratando) "full stack" Curitiba(React OR Node OR Python) - senior - sênior`
    ];


    const locations: ILocationOption[] = [
      {
        label: 'Remoto (Brasil)',
        workplaceTypes: ['remote'],
        locationQuery: 'trabalho-remoto',
      },
      {
        provider: 'glassdoor',
        label: 'Curitiba (Presencial/Híbrido)',
        workplaceTypes: ['onsite', 'hybrid'],
        locationQuery: 'curitiba-brasil',
        providerParams: {
          glassdoorLocationId: '2387909',
          linkedinGeoId: '103501557',
        },
      },
    ];

    this.logger.log('🚀 Iniciando pipeline consolidado de busca de vagas...');
    const webScrapedPosts = await this.scrapeWebProviders(queries, locations);

    // 2. Unifica todos os posts brutos
    const rawPosts = [...webScrapedPosts];
    this.logger.log(
      `Total de posts brutos coletados: ${rawPosts.length}. Iniciando filtragem e deduplicação...`,
    );

    const approvedJobs: ApprovedJobDto[] = [];
    const newlySentJobs: { url: string; title: string }[] = [];
    const seenLinks = new Set<string>();

    // 3. Processamento, Deduplicação e Heurística de todas as vagas de uma vez
    for (const post of rawPosts) {
      const text = post.text || '';
      let url = post.url || '';

      if (!text) continue;

      if (!url) {
        const hash = Buffer.from(text)
          .toString('base64')
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 50);
        url = `urn:job-hash:${hash}`;
      }

      if (seenLinks.has(url)) {
        this.logger.debug(`essa vaga já está na lista: ${url}`);
        continue;
      }
      seenLinks.add(url);

      // Deduplicação
      if (await this.historyRepository.exists(url, text)) {
        this.logger.debug(`⏭️ Ignorando vaga já enviada anteriormente: ${url}`);
        continue;
      }

      // Filtragem por heurística
      const result = await this.botService.filterJobs(text);

      if (result.shouldApply) {
        this.logger.log(
          `✅ Vaga aprovada (score: ${result.score}): ${text.substring(0, 80)}...`,
        );
        approvedJobs.push({
          score: result.score,
          reason: result.reason,
          url,
          previewText: text.substring(0, 150).replace(/\n/g, ' ').trim(),
        });

        newlySentJobs.push({ url, title: text });
      } else {
        this.logger.debug(
          `❌ Rejeitada: ${result.reason} — ${text.substring(0, 60)}...`,
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
