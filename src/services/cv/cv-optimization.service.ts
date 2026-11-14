import { Injectable, Logger, Optional } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { JobConfigService } from '../../config/job-config.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JevService } from '../jev/jev.service';
import { BotService } from '../bot/bot.service';
import { CvLlmService } from './cv-llm.service';
import { TypstTemplateService } from './typst-template.service';
import { TypstCompilerService } from './typst-compiler.service';
import {
  BaseCvData,
  TailoredCvEvaluation,
} from '../../interfaces/cv/cv.interface';

export interface CvOptimizationResult {
  pdfBuffer: Buffer;
  fileName: string;
  evaluation: TailoredCvEvaluation;
  tailoredCv: BaseCvData;
}

@Injectable()
export class CvOptimizationService {
  private readonly logger = new Logger(CvOptimizationService.name);

  constructor(
    private readonly jobConfigService: JobConfigService,
    @Optional() private readonly historyRepository: JobHistoryRepository,
    private readonly cvLlmService: CvLlmService,
    private readonly jevService: JevService,
    private readonly typstTemplateService: TypstTemplateService,
    private readonly typstCompilerService: TypstCompilerService,
    @Optional() private readonly botService: BotService,
  ) {}

  /**
   * Generates a tailored PDF resume for a stored job ID (#ID from the WhatsApp Digest)
   * and sends it via WhatsApp if configured.
   */
  async optimizeForStoredJobId(
    jobId: number,
    options?: { sendWhatsapp?: boolean; recipientNumber?: string },
  ): Promise<CvOptimizationResult> {
    const storedJob = await this.historyRepository.getJobById(jobId);
    if (!storedJob) {
      throw new Error(
        `Vaga [#${jobId}] não encontrada no histórico do banco de dados.`,
      );
    }

    let description = storedJob.description || storedJob.title;
    if (
      description.length < 300 &&
      storedJob.url &&
      storedJob.url.startsWith('http')
    ) {
      const enriched = await this.fetchJobDescriptionFromUrl(storedJob.url);
      if (enriched && enriched.length > description.length) {
        description = enriched;
      }
    }

    return this.optimizeForJobInput(
      {
        id: storedJob.id,
        title: storedJob.title,
        company: storedJob.company,
        description,
        url: storedJob.url,
      },
      options,
    );
  }

  /**
   * Generates a tailored PDF resume from an arbitrary URL or raw job description text.
   */
  async optimizeForCustomInput(
    rawInput: string,
    options?: { sendWhatsapp?: boolean; recipientNumber?: string },
  ): Promise<CvOptimizationResult> {
    const trimmed = rawInput.trim();
    let title = 'Desenvolvedor de Software';
    let description = trimmed;
    let url: string | undefined;

    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      url = trimmed;
      const fetched = await this.fetchJobPageMetadataAndText(url);
      if (fetched.title) title = fetched.title;
      if (fetched.description) description = fetched.description;
    } else {
      const firstLine = trimmed.split('\n')[0]?.trim();
      if (firstLine && firstLine.length < 90) {
        title = firstLine;
      }
    }

    return this.optimizeForJobInput(
      {
        title,
        description,
        url,
      },
      options,
    );
  }

  /**
   * Core pipeline: Base CV -> OpenRouter ATS Patch -> TypeSafe Jev Audit -> Typst PDF -> WhatsApp Document.
   */
  async optimizeForJobInput(
    jobInfo: {
      id?: number;
      title: string;
      company?: string;
      description: string;
      url?: string;
    },
    options?: { sendWhatsapp?: boolean; recipientNumber?: string },
  ): Promise<CvOptimizationResult> {
    const baseCv = this.jobConfigService.getBaseCv();

    const patch = await this.cvLlmService.generateTailoredCvPatch(baseCv, {
      title: jobInfo.title,
      company: jobInfo.company,
      description: jobInfo.description,
    });

    const evaluation = await this.jevService.evaluateTailoredCv(
      baseCv,
      patch,
      jobInfo,
    );

    const tailoredCv = this.typstTemplateService.mergeBaseWithPatch(
      baseCv,
      patch,
    );

    const typstDoc = this.typstTemplateService.renderTypstDocument(tailoredCv, {
      title: jobInfo.title,
      company: jobInfo.company,
    });

    const pdfBuffer =
      await this.typstCompilerService.compileToPdfBuffer(typstDoc);

    const fileName = this.buildSafePdfFileName(
      baseCv.name,
      jobInfo.company || jobInfo.title,
    );

    const shouldSendWhatsapp = options?.sendWhatsapp ?? true;
    const targetNumber =
      options?.recipientNumber || process.env.WHATSAPP_NUMBER;
    const instanceName = process.env.INSTANCE_NAME;

    if (shouldSendWhatsapp && targetNumber && instanceName) {
      const idTag = jobInfo.id ? `[#${jobInfo.id}] ` : '';
      const companyTag = jobInfo.company ? ` (${jobInfo.company})` : '';
      const caption = [
        `📄 *Currículo Otimizado Pronto!*`,
        `🎯 *Vaga:* ${idTag}${jobInfo.title}${companyTag}`,
        `📊 *${evaluation.summaryReason}*`,
        jobInfo.url && jobInfo.url.startsWith('http')
          ? `🔗 *Link:* ${jobInfo.url}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      await this.botService.sendMediaDocument({
        instanceName,
        number: targetNumber,
        fileName,
        base64Pdf: pdfBuffer.toString('base64'),
        caption,
      });
    }

    return {
      pdfBuffer,
      fileName,
      evaluation,
      tailoredCv,
    };
  }

  /**
   * Parses on-demand WhatsApp commands such as:
   * - "/cv 42" or "/cv #42"
   * - "/cv https://..."
   * - "/cv <job description>"
   */
  parseCvCommand(
    messageText: string,
  ):
    | { type: 'jobId'; jobId: number }
    | { type: 'custom'; input: string }
    | null {
    if (!messageText) return null;
    const trimmed = messageText.trim();

    // Match "/cv 42", "/cv #42", "cv 42", "gerar cv 42"
    const idMatch = trimmed.match(
      /^(?:\/cv|cv|gerar\s+cv|otimizar\s+cv)\s+#?(\d+)\s*$/i,
    );
    if (idMatch && idMatch[1]) {
      return { type: 'jobId', jobId: Number(idMatch[1]) };
    }

    // Match "/cv <url or text>"
    const customMatch = trimmed.match(/^\/cv\s+([\s\S]+)$/i);
    if (customMatch && customMatch[1]?.trim()) {
      return { type: 'custom', input: customMatch[1].trim() };
    }

    return null;
  }

  private buildSafePdfFileName(
    candidateName: string,
    targetSuffix: string,
  ): string {
    const normalize = (str: string) =>
      str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 35);

    const safeCandidate = normalize(candidateName || 'Candidato');
    const safeTarget = normalize(targetSuffix || 'Vaga');
    return `Curriculo_${safeCandidate}_${safeTarget}.pdf`;
  }

  private async fetchJobDescriptionFromUrl(url: string): Promise<string> {
    const { description } = await this.fetchJobPageMetadataAndText(url);
    return description;
  }

  private async fetchJobPageMetadataAndText(
    url: string,
  ): Promise<{ title: string; description: string }> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { title: '', description: '' };
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header, noscript, svg').remove();

      const pageTitle =
        $('h1').first().text().trim() || $('title').first().text().trim() || '';
      const bodyText = $('main, article, [class*="description"], body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 4000);

      return {
        title: pageTitle.substring(0, 120),
        description: bodyText,
      };
    } catch (error) {
      this.logger.debug(
        `Não foi possível enriquecer descrição via HTTP (${url}): ${error}`,
      );
      return { title: '', description: '' };
    }
  }
}
