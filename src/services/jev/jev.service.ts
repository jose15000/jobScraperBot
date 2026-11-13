import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
  evaluateJobFitWithJev,
  evaluateJobsBatchWithSystemOne,
  evaluateTailoredCvWithJev,
  SystemOneClient,
  UserProfileCriteria,
} from '../../utils/jev';
import { JobCandidateInput } from 'src/interfaces/JobCandidateInput/IjobcandidateInput';
import {
  BaseCvData,
  CvTailoredPatchDto,
  TailoredCvEvaluation,
} from 'src/interfaces/cv/cv.interface';
import {
  ClassifierProviderType,
  GeminiClassifierClient,
  NativeSystemOneHttpClient,
  OpenAiCompatibleClassifierClient,
} from './classifier-providers';
import { JobConfigService } from '../../config/job-config.service';

export interface JobEvaluationResult {
  shouldApply: boolean;
  score: number;
  reason: string;
}

@Injectable()
export class JevService implements OnModuleInit {
  private readonly logger = new Logger(JevService.name);
  private client: SystemOneClient | null = null;
  private isAvailable = false;
  private activeProviderName = 'none';

  constructor(@Optional() private readonly jobConfigService?: JobConfigService) {}

  onModuleInit() {
    this.initializeProvider();
  }

  initializeProvider(): void {
    const yamlClassifier = this.jobConfigService?.getClassifierConfig?.();
    const rawProvider = (
      process.env.CLASSIFIER_PROVIDER ||
      yamlClassifier?.provider ||
      'auto'
    )
      .trim()
      .toLowerCase() as ClassifierProviderType;

    const customModel =
      process.env.CLASSIFIER_MODEL || yamlClassifier?.model || '';
    const customBaseUrl =
      process.env.CLASSIFIER_BASE_URL || yamlClassifier?.baseUrl || '';
    const explicitApiKey = process.env.CLASSIFIER_API_KEY || '';

    const resolvedProvider = this.resolveProviderType(rawProvider);

    switch (resolvedProvider) {
      case 'groq': {
        const apiKey = explicitApiKey || process.env.GROQ_API_KEY || '';
        const model = customModel || 'llama-3.1-8b-instant';
        const baseUrl =
          customBaseUrl || 'https://api.groq.com/openai/v1/chat/completions';
        if (!apiKey) {
          this.logger.warn(
            '⚠️ CLASSIFIER_PROVIDER=groq selecionado, mas GROQ_API_KEY / CLASSIFIER_API_KEY não foi encontrada.',
          );
          this.isAvailable = false;
          return;
        }
        this.client = new OpenAiCompatibleClassifierClient({
          baseUrl,
          apiKey,
          model,
          providerName: 'Groq System-One',
        });
        this.activeProviderName = `groq (${model})`;
        this.isAvailable = true;
        break;
      }

      case 'gemini': {
        const apiKey = explicitApiKey || process.env.GEMINI_API_KEY || '';
        const model = customModel || 'gemini-2.5-flash-lite';
        if (!apiKey) {
          this.logger.warn(
            '⚠️ CLASSIFIER_PROVIDER=gemini selecionado, mas GEMINI_API_KEY / CLASSIFIER_API_KEY não foi encontrada.',
          );
          this.isAvailable = false;
          return;
        }
        this.client = new GeminiClassifierClient({
          apiKey,
          model,
          baseUrl: customBaseUrl || undefined,
        });
        this.activeProviderName = `gemini (${model})`;
        this.isAvailable = true;
        break;
      }

      case 'openrouter': {
        const apiKey =
          explicitApiKey ||
          process.env.OPEN_ROUTER_API_KEY ||
          process.env.OPENROUTER_API_KEY ||
          '';
        const model =
          customModel ||
          process.env.OPENROUTER_MODEL ||
          this.jobConfigService?.getCvOptimizationConfig?.()?.openRouterModel ||
          'openrouter/free';
        const baseUrl =
          customBaseUrl || 'https://openrouter.ai/api/v1/chat/completions';
        if (!apiKey) {
          this.logger.warn(
            '⚠️ CLASSIFIER_PROVIDER=openrouter selecionado, mas OPEN_ROUTER_API_KEY / CLASSIFIER_API_KEY não foi encontrada.',
          );
          this.isAvailable = false;
          return;
        }
        this.client = new OpenAiCompatibleClassifierClient({
          baseUrl,
          apiKey,
          model,
          providerName: 'OpenRouter System-One',
          extraHeaders: {
            'HTTP-Referer': 'https://github.com/jose15000/jobScraperBot',
            'X-Title': 'LioApply System-One Classifier',
          },
        });
        this.activeProviderName = `openrouter (${model})`;
        this.isAvailable = true;
        break;
      }

      case 'ollama':
      case 'openai-compatible': {
        const apiKey = explicitApiKey || 'ollama';
        const model = customModel || 'qwen2.5:3b';
        const baseUrl =
          customBaseUrl || 'http://localhost:11434/v1/chat/completions';
        this.client = new OpenAiCompatibleClassifierClient({
          baseUrl,
          apiKey,
          model,
          providerName: `Local/OpenAI (${resolvedProvider})`,
        });
        this.activeProviderName = `${resolvedProvider} (${model} @ ${baseUrl})`;
        this.isAvailable = true;
        break;
      }

      case 'kev':
      case 'laya':
      case 'jev':
      case 'systemone': {
        const apiKey =
          explicitApiKey ||
          process.env.TYPESAFE_API_KEY ||
          process.env.JEV_API_KEY ||
          '';
        const defaultUrl =
          resolvedProvider === 'kev'
            ? 'http://localhost:8009/v1/systemone'
            : resolvedProvider === 'laya'
              ? 'http://localhost:8000/v1/systemone'
              : 'https://api.typesafe.ai/v1/systemone';
        const baseUrl = customBaseUrl || defaultUrl;

        const defaultModel =
          resolvedProvider === 'kev'
            ? 'kev-0.8b'
            : resolvedProvider === 'laya'
              ? 'laya-multilingual'
              : 'jev-latest';

        this.client = new NativeSystemOneHttpClient({
          baseUrl,
          apiKey: apiKey || undefined,
          model: customModel || defaultModel,
          providerName: `SystemOne (${resolvedProvider})`,
        });
        this.activeProviderName = `${resolvedProvider} (${baseUrl})`;
        this.isAvailable = true;
        break;
      }

      default: {
        this.logger.warn(
          '⚠️ Nenhum provider de classificação configurado (defina OPEN_ROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY ou CLASSIFIER_PROVIDER).',
        );
        this.isAvailable = false;
        return;
      }
    }

    this.logger.log(
      `✅ Classificador System-One inicializado com provider: ${this.activeProviderName}`,
    );
  }

  private resolveProviderType(
    requested: ClassifierProviderType,
  ): ClassifierProviderType | 'none' {
    if (requested && requested !== 'auto') {
      return requested;
    }

    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY) {
      return 'openrouter';
    }
    if (process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY) {
      return 'systemone';
    }
    if (process.env.CLASSIFIER_BASE_URL) {
      return 'openai-compatible';
    }
    return 'none';
  }

  getActiveProviderName(): string {
    return this.activeProviderName;
  }

  setClientForTesting(client: SystemOneClient, providerName = 'test'): void {
    this.client = client;
    this.isAvailable = true;
    this.activeProviderName = providerName;
  }

  async evaluateJob(
    job: JobCandidateInput,
    profile: UserProfileCriteria,
  ): Promise<JobEvaluationResult> {
    if (!this.isAvailable && !this.client) {
      this.initializeProvider();
    }

    if (!this.isAvailable || !this.client) {
      this.logger.error(
        'Classificador System-One não está inicializado para avaliar a vaga.',
      );
      return {
        shouldApply: false,
        score: 0,
        reason: 'Classificador não configurado (chave ausente).',
      };
    }

    try {
      const evaluation = await evaluateJobFitWithJev(this.client, job, profile);

      return {
        shouldApply: evaluation.shouldApply,
        score: evaluation.score,
        reason: evaluation.reason,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao avaliar vaga com o classificador (${this.activeProviderName}): ${error}`,
        error,
      );
      return {
        shouldApply: false,
        score: 0,
        reason: `Erro na avaliação com o classificador: ${error}`,
      };
    }
  }

  /**
   * Evaluates multiple jobs in compact batches (default: 10 jobs per forward pass)
   * to drastically reduce token usage and API requests. Falls back to per-job evaluation if needed.
   */
  async evaluateJobsBatch(
    jobs: JobCandidateInput[],
    profile: UserProfileCriteria,
    batchSize = 10,
  ): Promise<JobEvaluationResult[]> {
    if (jobs.length === 0) return [];

    if (!this.isAvailable && !this.client) {
      this.initializeProvider();
    }

    if (!this.isAvailable || !this.client) {
      return jobs.map(() => ({
        shouldApply: false,
        score: 0,
        reason: 'Classificador não configurado (chave ausente).',
      }));
    }

    const results: JobEvaluationResult[] = [];
    for (let i = 0; i < jobs.length; i += batchSize) {
      const chunk = jobs.slice(i, i + batchSize);
      try {
        const chunkEvaluations = await evaluateJobsBatchWithSystemOne(
          this.client,
          chunk,
          profile,
        );
        results.push(
          ...chunkEvaluations.map((ev) => ({
            shouldApply: ev.shouldApply,
            score: ev.score,
            reason: ev.reason,
          })),
        );
      } catch (batchErr) {
        this.logger.warn(
          `Aviso: Falha no lote de classificação (${chunk.length} vagas), executando fallback individual: ${batchErr}`,
        );
        for (const job of chunk) {
          results.push(await this.evaluateJob(job, profile));
        }
      }
    }

    return results;
  }

  async evaluateTailoredCv(
    baseCv: BaseCvData,
    tailoredPatch: CvTailoredPatchDto,
    jobInfo: { title: string; company?: string; description: string },
  ): Promise<TailoredCvEvaluation> {
    if (!this.isAvailable && !this.client) {
      this.initializeProvider();
    }

    if (!this.isAvailable || !this.client) {
      return {
        isCredible: true,
        credibilityProbability: 1,
        atsScore: 85,
        summaryReason: 'Currículo adaptado para ATS.',
      };
    }

    return evaluateTailoredCvWithJev(
      this.client,
      baseCv,
      tailoredPatch,
      jobInfo,
    );
  }
}
