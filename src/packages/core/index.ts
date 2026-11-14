import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  Optional,
} from '@nestjs/common';
import { JobConfigService } from '../../config/job-config.service';
import {
  ClassifierProviderConfig,
  ClassifierProviderType,
  buildCompactClassifierPayload,
  parseSystemOneJsonOutput,
} from '../../services/jev/classifier-providers';
import { JevService, JobEvaluationResult } from '../../services/jev/jev.service';
import {
  ApprovedJobDto,
  JobDigestFormatter,
} from '../../services/task-service/job-digest.formatter';
import {
  JobDeduplicationService,
  NormalizedCandidateJob,
  normalizeScrapedPost,
} from '../../utils/deduplication';
import {
  JOB_FIT_QUESTIONS,
  NoulQuestion,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
  UserProfileCriteria,
  buildJobFitEvaluationFromProbabilities,
  evaluateJobFitWithJev,
  evaluateJobsBatchWithSystemOne,
  evaluateTailoredCvWithJev,
  noul,
} from '../../utils/jev';
import {
  ILocationOption,
  IProviderConfig,
} from '../../interfaces/isearch/isearch.interface';
import {
  BuiltinProviderName,
  PlaywrightService,
  resolveProviders,
} from '../providers';
import { CvEngineOptions, createCvEngine } from '../cv';

export const LIOAPPLY_PROVIDERS = 'LIOAPPLY_PROVIDERS';

export interface LioApplyOptions {
  /**
   * Array of provider names ('linkedin', 'glassdoor', 'remotar') or custom `IProviderConfig` instances.
   */
  providers?: Array<BuiltinProviderName | string | IProviderConfig>;
  /**
   * Multi-provider System-One classifier configuration.
   */
  classifier?: Partial<ClassifierProviderConfig>;
  /**
   * Optional user profile override (defaults to `jobs.config.yaml`).
   */
  profile?: Partial<UserProfileCriteria>;
  /**
   * Optional CV engine options (`@lioapply/cv`).
   */
  cv?: CvEngineOptions;
  /**
   * Max concurrent browser tabs during scraping (default: 3).
   */
  scraperConcurrency?: number;
}

export interface ApprovedCandidateJobDto extends ApprovedJobDto {
  description?: string;
}

export interface SearchAndClassifyOutput {
  rawCount: number;
  uniqueCandidates: NormalizedCandidateJob[];
  approvedJobs: ApprovedCandidateJobDto[];
  digestText: string;
}

/**
 * Hybrid Functional SDK (`@lioapply/core`): Creates a self-contained LioApply automation instance
 * with injected providers, System-One classifier, deduplication, and optional CV engine.
 */
export function createLioApply(options?: LioApplyOptions) {
  if (options?.classifier?.provider) {
    process.env.CLASSIFIER_PROVIDER = options.classifier.provider;
  }
  if (options?.classifier?.apiKey) {
    process.env.CLASSIFIER_API_KEY = options.classifier.apiKey;
  }
  if (options?.classifier?.model) {
    process.env.CLASSIFIER_MODEL = options.classifier.model;
  }
  if (options?.classifier?.baseUrl) {
    process.env.CLASSIFIER_BASE_URL = options.classifier.baseUrl;
  }

  const configService = new JobConfigService();
  try {
    configService.loadConfig();
  } catch {
    // Allows programmatic execution even without jobs.config.yaml on disk
  }

  const deduplicationService = new JobDeduplicationService();
  const digestFormatter = new JobDigestFormatter();
  const playwrightService = new PlaywrightService();
  const jevService = new JevService(configService);
  jevService.initializeProvider();

  const activeProviders = resolveProviders(options?.providers);
  const cvEngine = createCvEngine(options?.cv);

  return {
    configService,
    deduplicationService,
    digestFormatter,
    playwrightService,
    classifierService: jevService,
    cv: cvEngine,

    getProviders(): IProviderConfig[] {
      return activeProviders;
    },

    getUserProfile(): UserProfileCriteria {
      const base = configService.getUserProfile();
      return {
        targetRoles: options?.profile?.targetRoles || base.targetRoles,
        targetTechnologies:
          options?.profile?.targetTechnologies || base.targetTechnologies,
        acceptableLevels:
          options?.profile?.acceptableLevels || base.acceptableLevels,
        excludedLevels: options?.profile?.excludedLevels || base.excludedLevels,
        locations: options?.profile?.locations || base.locations,
      };
    },

    /**
     * Scrapes jobs from the injected providers and deduplicates by normalized title + company.
     */
    async scrapeJobs(params?: {
      queries?: string[];
      locations?: ILocationOption[];
      providers?: Array<BuiltinProviderName | string | IProviderConfig>;
      existingJobs?: Array<{ title: string; company?: string }>;
    }): Promise<{
      rawCount: number;
      uniqueCandidates: NormalizedCandidateJob[];
    }> {
      const queries = params?.queries || configService.getQueries();
      const locations = params?.locations || configService.getLocations();
      const providersToUse = params?.providers
        ? resolveProviders(params.providers)
        : activeProviders;

      const rawPosts = await playwrightService.scrapeProviders(
        providersToUse,
        queries,
        locations,
        options?.scraperConcurrency,
      );

      const seenKeys = deduplicationService.createKeySet(
        params?.existingJobs || [],
      );
      const uniqueCandidates: NormalizedCandidateJob[] = [];

      for (const post of rawPosts) {
        const normalized = normalizeScrapedPost(post);
        if (!normalized) continue;
        if (
          deduplicationService.isDuplicate(
            { title: normalized.title, company: normalized.company },
            seenKeys,
          )
        ) {
          continue;
        }
        seenKeys.add(
          deduplicationService.createKey(normalized.title, normalized.company),
        );
        uniqueCandidates.push(normalized);
      }

      return {
        rawCount: rawPosts.length,
        uniqueCandidates,
      };
    },

    /**
     * Builds the System-One `{ state, questions }` rubric payload for agent-native classification (e.g. inside an MCP host agent).
     */
    buildSystemOneClassificationState(
      candidates: NormalizedCandidateJob[],
      profileOverride?: Partial<UserProfileCriteria>,
    ) {
      const profile = {
        ...this.getUserProfile(),
        ...(profileOverride || {}),
      };

      return {
        state: {
          user_criteria: {
            desired_roles: profile.targetRoles,
            desired_technologies: profile.targetTechnologies,
            acceptable_levels: profile.acceptableLevels,
            strictly_excluded_levels: profile.excludedLevels,
            allowed_locations: profile.locations,
          },
          job_candidates: candidates.map((c, idx) => ({
            id: idx,
            title: c.title,
            company: c.company,
            location: c.location || 'Não especificada',
            url: c.url,
            description_excerpt: c.text.substring(0, 600),
          })),
        },
        questions: JOB_FIT_QUESTIONS,
        thresholds: {
          is_actual_job_offer: 0.6,
          matches_profile: 0.5,
        },
      };
    },

    /**
     * Evaluates candidate jobs in batch using the configured System-One Multi-Provider classifier.
     */
    async classifyJobs(
      candidates: NormalizedCandidateJob[],
      profileOverride?: Partial<UserProfileCriteria>,
    ): Promise<ApprovedCandidateJobDto[]> {
      if (candidates.length === 0) return [];
      const profile = {
        ...this.getUserProfile(),
        ...(profileOverride || {}),
      };

      const evaluations = await jevService.evaluateJobsBatch(
        candidates,
        profile,
      );
      const approved: ApprovedCandidateJobDto[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const ev = evaluations[i];
        if (!ev?.shouldApply) continue;

        approved.push({
          title: candidate.title,
          company: candidate.company,
          score: ev.score,
          reason: ev.reason,
          url: candidate.url,
          description: candidate.text,
          previewText: candidate.text
            .substring(0, 150)
            .replace(/\n/g, ' ')
            .trim(),
        });
      }

      return approved;
    },

    /**
     * Runs the complete scrape -> deduplicate -> classify -> format digest pipeline.
     */
    async searchAndClassify(params?: {
      queries?: string[];
      locations?: ILocationOption[];
      providers?: Array<BuiltinProviderName | string | IProviderConfig>;
      existingJobs?: Array<{ title: string; company?: string }>;
    }): Promise<SearchAndClassifyOutput> {
      const { rawCount, uniqueCandidates } = await this.scrapeJobs(params);
      const approvedJobs = await this.classifyJobs(uniqueCandidates);
      const digestText =
        approvedJobs.length > 0 ? digestFormatter.format(approvedJobs) : '';

      return {
        rawCount,
        uniqueCandidates,
        approvedJobs,
        digestText,
      };
    },
  };
}

@Injectable()
export class LioApplyCoreService {
  private readonly logger = new Logger(LioApplyCoreService.name);

  constructor(
    private readonly configService: JobConfigService,
    private readonly deduplicationService: JobDeduplicationService,
    private readonly jevService: JevService,
    private readonly digestFormatter: JobDigestFormatter,
    private readonly playwrightService: PlaywrightService,
    @Optional()
    @Inject(LIOAPPLY_PROVIDERS)
    private readonly injectedProviders?: IProviderConfig[],
  ) {}

  async searchAndClassify(params?: {
    existingJobs?: Array<{ title: string; company?: string }>;
  }): Promise<SearchAndClassifyOutput> {
    const queries = this.configService.getQueries();
    const locations = this.configService.getLocations();
    const userProfile = this.configService.getUserProfile();
    const providers =
      this.injectedProviders ||
      this.configService.getProviders?.() ||
      resolveProviders();

    this.logger.log(
      `🚀 [LioApplyCore] Buscando vagas em ${providers.length} providers para ${queries.length} queries...`,
    );

    const rawPosts = await this.playwrightService.scrapeProviders(
      providers,
      queries,
      locations,
    );

    const seenKeys = this.deduplicationService.createKeySet(
      params?.existingJobs || [],
    );
    const uniqueCandidates: NormalizedCandidateJob[] = [];

    for (const post of rawPosts) {
      const normalized = normalizeScrapedPost(post);
      if (!normalized) continue;
      if (
        this.deduplicationService.isDuplicate(
          { title: normalized.title, company: normalized.company },
          seenKeys,
        )
      ) {
        continue;
      }
      seenKeys.add(
        this.deduplicationService.createKey(
          normalized.title,
          normalized.company,
        ),
      );
      uniqueCandidates.push(normalized);
    }

    if (uniqueCandidates.length === 0) {
      return {
        rawCount: rawPosts.length,
        uniqueCandidates: [],
        approvedJobs: [],
        digestText: '',
      };
    }

    this.logger.log(
      `🧠 [LioApplyCore] Classificando ${uniqueCandidates.length} vagas inéditas em lote...`,
    );
    const evaluations =
      typeof this.jevService.evaluateJobsBatch === 'function'
        ? await this.jevService.evaluateJobsBatch(uniqueCandidates, userProfile)
        : await Promise.all(
            uniqueCandidates.map((c) =>
              this.jevService.evaluateJob(c, userProfile),
            ),
          );

    const approvedJobs: ApprovedCandidateJobDto[] = [];
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i];
      const ev = evaluations[i];
      if (!ev?.shouldApply) continue;

      this.logger.log(
        `✅ Vaga aprovada (score: ${ev.score}): ${candidate.title}${candidate.company ? ` (${candidate.company})` : ''}`,
      );
      approvedJobs.push({
        title: candidate.title,
        company: candidate.company,
        score: ev.score,
        reason: ev.reason,
        url: candidate.url,
        description: candidate.text,
        previewText: candidate.text
          .substring(0, 150)
          .replace(/\n/g, ' ')
          .trim(),
      });
    }

    const digestText =
      approvedJobs.length > 0 ? this.digestFormatter.format(approvedJobs) : '';

    return {
      rawCount: rawPosts.length,
      uniqueCandidates,
      approvedJobs,
      digestText,
    };
  }
}

@Global()
@Module({})
export class LioApplyCoreModule {
  static register(options?: LioApplyOptions): DynamicModule {
    const resolved = resolveProviders(options?.providers);
    return {
      module: LioApplyCoreModule,
      providers: [
        JobConfigService,
        JobDeduplicationService,
        JevService,
        JobDigestFormatter,
        PlaywrightService,
        LioApplyCoreService,
        {
          provide: LIOAPPLY_PROVIDERS,
          useValue: resolved,
        },
      ],
      exports: [
        JobConfigService,
        JobDeduplicationService,
        JevService,
        JobDigestFormatter,
        PlaywrightService,
        LioApplyCoreService,
        LIOAPPLY_PROVIDERS,
      ],
    };
  }
}

export {
  JobConfigService,
  JobDeduplicationService,
  normalizeScrapedPost,
  JevService,
  JobDigestFormatter,
  buildCompactClassifierPayload,
  parseSystemOneJsonOutput,
  noul,
  JOB_FIT_QUESTIONS,
  buildJobFitEvaluationFromProbabilities,
  evaluateJobFitWithJev,
  evaluateJobsBatchWithSystemOne,
  evaluateTailoredCvWithJev,
};

export type {
  NormalizedCandidateJob,
  JobEvaluationResult,
  ApprovedJobDto,
  ClassifierProviderConfig,
  ClassifierProviderType,
  NoulQuestion,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
  UserProfileCriteria,
};
