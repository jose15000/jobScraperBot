import { Injectable, Logger, Optional } from '@nestjs/common';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter, ApprovedJobDto } from './job-digest.formatter';
import { LioApplyCoreService } from '@lioapply/core';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly botService: BotService,
    private readonly historyRepository: JobHistoryRepository,
    private readonly digestFormatter: JobDigestFormatter,
    @Optional() private readonly lioCore?: LioApplyCoreService,
  ) {}

  async runScrapeJob(): Promise<ApprovedJobDto[]> {
    // 1. Busca histórico recente do PostgreSQL para deduplicação
    const recentStoredJobs = await this.historyRepository.getRecentJobs(
      300,
      30,
    );

    if (!this.lioCore) {
      this.logger.warn('LioApplyCoreService não injetado.');
      return [];
    }

    // 2. O @lioapply/core executa o pipeline: Scrape -> Deduplica -> Classifica em Lote
    const { approvedJobs } = await this.lioCore.searchAndClassify({
      existingJobs: recentStoredJobs,
    });

    if (approvedJobs.length === 0) {
      this.logger.log(
        'Nenhuma nova vaga aprovada passou pelos filtros nesta execução.',
      );
      return [];
    }

    // 3. Salva no banco para vincular os IDs ([#ID]) do comando /cv
    const savedRecords =
      (await this.historyRepository.save(
        approvedJobs.map((job) => ({
          url: job.url,
          title: job.title || 'Desenvolvedor',
          company: job.company,
          description: job.description || job.previewText,
        })),
      )) || [];

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

    // 4. Formata o Digest e envia no WhatsApp
    await this.botService.sendMessage({
      instanceName: process.env.INSTANCE_NAME!,
      number: process.env.WHATSAPP_NUMBER!,
      text: this.digestFormatter.format(approvedJobs),
      delay: 1500,
    });

    return approvedJobs;
  }
}
