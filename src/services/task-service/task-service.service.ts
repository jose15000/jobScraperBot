import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';
import { DEFAULT_WEB_PROVIDERS } from '../../config/providers';
import { LinkedinApifyService } from '../Linkedin/linkedin-apify.service';
import { JevService } from '../jev/jev.service';
import {
  JobDeduplicationService,
  NormalizedCandidateJob,
  normalizeScrapedPost,
} from '../../utils/deduplication';
import { JobConfigService } from '../../config/job-config.service';
import { IProviderConfig } from '../../interfaces/isearch/isearch.interface';
import { LIOAPPLY_PROVIDERS } from '../../packages/core';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly botService: BotService,
    private readonly jevService: JevService,
    private readonly historyRepository: JobHistoryRepository,
    @Optional() private readonly scrapeLinkedinPosts: LinkedinApifyService,
    private readonly digestFormatter: JobDigestFormatter,
    private readonly jobDeduplicationService: JobDeduplicationService,
    private readonly jobConfigService: JobConfigService,
    @Optional()
    @Inject(LIOAPPLY_PROVIDERS)
    private readonly injectedProviders?: IProviderConfig[],
  ) {}

  async runScrapeJob(): Promise<ApprovedJobDto[]> {
    const queries = this.jobConfigService.getQueries();
    const locations = this.jobConfigService.getLocations();
    const userProfile = this.jobConfigService.getUserProfile();
    const activeProviders =
      this.injectedProviders ||
      this.jobConfigService.getProviders?.() ||
      DEFAULT_WEB_PROVIDERS;

    this.logger.log('🚀 Iniciando pipeline consolidado de busca de vagas...');
    this.logger.log(
      `🔍 Queries configuradas (${queries.length}): ${queries.join(', ')}`,
    );

    // 1. Coleta unificada em sessão única do navegador com concorrência controlada
    const rawPosts =
      typeof this.botService.scrapeProviders === 'function'
        ? await this.botService.scrapeProviders(
            activeProviders,
            queries,
            locations,
          )
        : [];

    this.logger.log(
      `Total de posts brutos coletados: ${rawPosts.length}. Carregando histórico do banco e iniciando filtragem...`,
    );

    // 2. Deduplicação por Título + Empresa contra histórico recente do PostgreSQL
    const recentStoredJobs = await this.historyRepository.getRecentJobs(
      300,
      30,
    );
    const seenJobKeys =
      this.jobDeduplicationService.createKeySet(recentStoredJobs);

    const uniqueCandidates: NormalizedCandidateJob[] = [];
    for (const post of rawPosts) {
      const normalized = normalizeScrapedPost(post);
      if (!normalized) continue;

      if (
        this.jobDeduplicationService.isDuplicate(
          { title: normalized.title, company: normalized.company },
          seenJobKeys,
        )
      ) {
        continue;
      }

      seenJobKeys.add(
        this.jobDeduplicationService.createKey(
          normalized.title,
          normalized.company,
        ),
      );
      uniqueCandidates.push(normalized);
    }

    if (uniqueCandidates.length === 0) {
      this.logger.log('Nenhuma vaga inédita encontrada nesta execução.');
      return [];
    }

    // 3. Classificação Semântica em Lote (System-One Multi-Provider)
    this.logger.log(
      `🧠 Classificando ${uniqueCandidates.length} vagas inéditas com o Classificador System-One...`,
    );
    const evaluations =
      typeof this.jevService.evaluateJobsBatch === 'function'
        ? await this.jevService.evaluateJobsBatch(uniqueCandidates, userProfile)
        : await Promise.all(
            uniqueCandidates.map((c) =>
              this.jevService.evaluateJob(c, userProfile),
            ),
          );

    const approvedJobs: ApprovedJobDto[] = [];
    const newlySentJobs: Array<{
      url: string;
      title: string;
      company?: string;
      description?: string;
    }> = [];

    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i];
      const result = evaluations[i];
      if (!result?.shouldApply) continue;

      this.logger.log(
        `✅ Vaga aprovada (score: ${result.score}): ${candidate.title}${candidate.company ? ` (${candidate.company})` : ''}`,
      );
      approvedJobs.push({
        title: candidate.title,
        company: candidate.company,
        score: result.score,
        reason: result.reason,
        url: candidate.url,
        previewText: candidate.text
          .substring(0, 150)
          .replace(/\n/g, ' ')
          .trim(),
      });

      newlySentJobs.push({
        url: candidate.url,
        title: candidate.title,
        company: candidate.company,
        description: candidate.text,
      });
    }

    if (approvedJobs.length === 0) {
      this.logger.log(
        'Nenhuma nova vaga aprovada passou pelos filtros nesta execução.',
      );
      return [];
    }

    // 4. Persistência e Disparo de Digest no WhatsApp
    const savedRecords =
      (await this.historyRepository.save(newlySentJobs)) || [];
    const urlToIdMap = new Map<string, number>();
    for (const rec of savedRecords) {
      if (rec.url && rec.id) {
        urlToIdMap.set(rec.url, rec.id);
      }
    }

    for (const approved of approvedJobs) {
      const dbId = urlToIdMap.get(approved.url);
      if (dbId) approved.id = dbId;
    }

    const fullDigest = this.digestFormatter.format(approvedJobs);
    await this.botService.sendMessage({
      instanceName: process.env.INSTANCE_NAME!,
      number: process.env.WHATSAPP_NUMBER!,
      text: fullDigest,
      delay: 1500,
    });

    return approvedJobs;
  }
}
