import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { AppJobConfig } from '../interfaces/job-config/job-config.interface';
import { UserProfileCriteria } from '../utils/jev';
import { ILocationOption, IProviderConfig } from '../interfaces/isearch/isearch.interface';
import { BaseCvData, CvOptimizationConfig } from '../interfaces/cv/cv.interface';
import { ClassifierProviderConfig } from '../services/jev/classifier-providers';
import { resolveProviders } from '../packages/providers';

@Injectable()
export class JobConfigService implements OnModuleInit {
  private readonly logger = new Logger(JobConfigService.name);
  private config!: AppJobConfig;

  onModuleInit() {
    this.loadConfig();
  }

  loadConfig(): AppJobConfig {
    // 1. Tenta carregar diretamente de variável de ambiente com YAML (ex: Railway / .env)
    const envYaml =
      process.env.JOBS_CONFIG_YAML || process.env.JOBS_CONFIG_CONTENT;
    if (envYaml && envYaml.trim().length > 0) {
      try {
        const parsed = YAML.parse(envYaml);
        if (parsed && typeof parsed === 'object') {
          this.logger.log(
            '📄 Configuração carregada com sucesso da variável de ambiente JOBS_CONFIG_YAML.',
          );
          this.config = this.normalizeConfig(parsed);
          this.validateConfig(this.config, 'variável JOBS_CONFIG_YAML');
          return this.config;
        }
      } catch (err: any) {
        this.logger.warn(
          `Aviso: Falha ao parsear JOBS_CONFIG_YAML da variável de ambiente (${err.message}). Tentando carregar de arquivo em disco...`,
        );
      }
    }

    if (process.env.JOBS_CONFIG_BASE64) {
      try {
        const decoded = Buffer.from(
          process.env.JOBS_CONFIG_BASE64,
          'base64',
        ).toString('utf8');
        const parsed = YAML.parse(decoded);
        if (parsed && typeof parsed === 'object') {
          this.logger.log(
            '📄 Configuração carregada com sucesso da variável JOBS_CONFIG_BASE64.',
          );
          this.config = this.normalizeConfig(parsed);
          this.validateConfig(this.config, 'variável JOBS_CONFIG_BASE64');
          return this.config;
        }
      } catch (err: any) {
        this.logger.warn(
          `Aviso: Falha ao parsear JOBS_CONFIG_BASE64 da variável de ambiente (${err.message}). Tentando carregar de arquivo em disco...`,
        );
      }
    }

    // 2. Tenta carregar a partir de arquivos no disco
    const candidatePaths = [
      process.env.CONFIG_PATH,
      path.resolve(process.cwd(), 'jobs.config.yaml'),
      path.resolve(process.cwd(), 'jobs.config.yml'),
      '/usr/src/app/jobs.config.yaml',
    ].filter((p): p is string => Boolean(p));

    for (const configPath of candidatePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const fileContent = fs.readFileSync(configPath, 'utf8');
          const parsed = YAML.parse(fileContent);
          if (parsed && typeof parsed === 'object') {
            this.logger.log(
              `📄 Configuração carregada com sucesso do arquivo: ${configPath}`,
            );
            this.config = this.normalizeConfig(parsed);
            this.validateConfig(this.config, configPath);
            return this.config;
          }
        } catch (err: any) {
          this.logger.error(
            `Erro ao ler/parsear arquivo de configuração em ${configPath}: ${err.message}`,
          );
          throw err;
        }
      }
    }

    // 3. Fallback para variáveis granulares do ambiente (SEARCH_QUERIES, etc.)
    if (process.env.SEARCH_QUERIES) {
      this.logger.log(
        '📄 Configuração carregada via variáveis granulares do ambiente (SEARCH_QUERIES, etc.).',
      );
      const queries = process.env.SEARCH_QUERIES.split(',')
        .map((q) => q.trim())
        .filter(Boolean);

      let locations: ILocationOption[] = [];
      if (process.env.SEARCH_LOCATIONS_JSON) {
        try {
          locations = JSON.parse(process.env.SEARCH_LOCATIONS_JSON);
        } catch (e: any) {
          this.logger.warn(
            `Aviso: Falha ao parsear SEARCH_LOCATIONS_JSON como JSON: ${e.message}`,
          );
        }
      }

      if (locations.length === 0) {
        const locList = process.env.SEARCH_LOCATIONS
          ? process.env.SEARCH_LOCATIONS.split(',').map((l) =>
              l.trim().toLowerCase(),
            )
          : ['remoto'];

        for (const loc of locList) {
          if (loc.includes('remot')) {
            locations.push({
              label: 'Remoto (Brasil)',
              workplaceTypes: ['remote'],
              locationQuery: 'trabalho-remoto',
            });
          } else if (loc.includes('curitiba')) {
            locations.push({
              provider: 'glassdoor',
              label: 'Curitiba (Presencial/Híbrido)',
              workplaceTypes: ['onsite', 'hybrid'],
              locationQuery: 'curitiba-brasil',
              providerParams: { glassdoorLocationId: '2387909' },
            });
          } else if (loc.includes('paulo') || loc.includes('sp')) {
            locations.push({
              provider: 'linkedin',
              label: 'São Paulo',
              workplaceTypes: ['remote', 'onsite', 'hybrid'],
              locationQuery: 'sao-paulo-brasil',
              providerParams: { linkedinGeoId: '103501557' },
            });
          } else {
            locations.push({
              label: loc,
              workplaceTypes: ['remote', 'onsite', 'hybrid'],
              locationQuery: loc.replace(/\s+/g, '-'),
            });
          }
        }
      }

      const profile: Partial<UserProfileCriteria> = {
        targetRoles: process.env.PROFILE_TARGET_ROLES
          ? process.env.PROFILE_TARGET_ROLES.split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        targetTechnologies: process.env.PROFILE_TARGET_TECHNOLOGIES
          ? process.env.PROFILE_TARGET_TECHNOLOGIES.split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        acceptableLevels: process.env.PROFILE_ACCEPTABLE_LEVELS
          ? process.env.PROFILE_ACCEPTABLE_LEVELS.split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        excludedLevels: process.env.PROFILE_EXCLUDED_LEVELS
          ? process.env.PROFILE_EXCLUDED_LEVELS.split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        locations: process.env.PROFILE_LOCATIONS
          ? process.env.PROFILE_LOCATIONS.split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      };

      this.config = {
        search: {
          queries,
          locations,
        },
        profile,
      };

      this.validateConfig(this.config, 'variáveis de ambiente');
      return this.config;
    }

    throw new Error(
      "Configuração ausente: Forneça a variável JOBS_CONFIG_YAML (ou SEARCH_QUERIES) no ambiente (.env / Railway) ou crie o arquivo 'jobs.config.yaml' a partir de 'jobs.config.example.yaml'.",
    );
  }

  getQueries(): string[] {
    return this.config.search.queries;
  }

  getLocations(): ILocationOption[] {
    return this.config.search.locations;
  }

  getProviders(): IProviderConfig[] {
    const envProviders = process.env.SEARCH_PROVIDERS
      ? process.env.SEARCH_PROVIDERS.split(',').map((p) => p.trim()).filter(Boolean)
      : undefined;
    return resolveProviders(envProviders || this.config?.search?.providers);
  }

  getUserProfile(): UserProfileCriteria {
    return {
      targetRoles: this.config.profile?.targetRoles || [],
      targetTechnologies: this.config.profile?.targetTechnologies || [],
      acceptableLevels: this.config.profile?.acceptableLevels || [],
      excludedLevels: this.config.profile?.excludedLevels || [],
      locations: this.config.profile?.locations || [],
    };
  }

  getConfig(): AppJobConfig {
    return this.config;
  }

  getClassifierConfig(): Partial<ClassifierProviderConfig> {
    return {
      provider:
        (process.env.CLASSIFIER_PROVIDER as any) ||
        this.config?.classifier?.provider ||
        'auto',
      model:
        process.env.CLASSIFIER_MODEL ||
        this.config?.classifier?.model,
      baseUrl:
        process.env.CLASSIFIER_BASE_URL ||
        this.config?.classifier?.baseUrl,
    };
  }

  getCvOptimizationConfig(): CvOptimizationConfig {
    return {
      openRouterModel:
        process.env.OPENROUTER_MODEL ||
        this.config.cvOptimization?.openRouterModel ||
        'openrouter/free',
      baseCvPath:
        process.env.CV_BASE_PATH ||
        this.config.cvOptimization?.baseCvPath ||
        path.resolve(process.cwd(), 'cv.base.yaml'),
    };
  }

  getBaseCv(): BaseCvData {
    const envCvYaml = process.env.CV_BASE_YAML;
    if (envCvYaml && envCvYaml.trim().length > 0) {
      return YAML.parse(envCvYaml) as BaseCvData;
    }

    if (process.env.CV_BASE_BASE64 && process.env.CV_BASE_BASE64.trim().length > 0) {
      const decoded = Buffer.from(process.env.CV_BASE_BASE64, 'base64').toString('utf8');
      return YAML.parse(decoded) as BaseCvData;
    }

    const { baseCvPath } = this.getCvOptimizationConfig();
    const candidatePaths = [
      path.isAbsolute(baseCvPath)
        ? baseCvPath
        : path.resolve(process.cwd(), baseCvPath),
      path.resolve(process.cwd(), 'cv.base.yaml'),
      path.resolve(process.cwd(), 'cv.base.example.yaml'),
      '/usr/src/app/cv.base.yaml',
    ];

    for (const cvPath of candidatePaths) {
      if (fs.existsSync(cvPath)) {
        const raw = fs.readFileSync(cvPath, 'utf8');
        const parsed = YAML.parse(raw) as BaseCvData;
        if (parsed && typeof parsed === 'object' && parsed.name) {
          return parsed;
        }
      }
    }

    throw new Error(
      "Currículo base não encontrado: crie o arquivo 'cv.base.yaml' na raiz do projeto ou defina CV_BASE_YAML no ambiente.",
    );
  }

  private validateConfig(config: AppJobConfig, sourceDescription: string) {
    if (!config.search?.queries || config.search.queries.length === 0) {
      throw new Error(
        `Configuração inválida em ${sourceDescription}: 'search.queries' deve conter pelo menos uma query de busca.`,
      );
    }
    if (!config.search?.locations || config.search.locations.length === 0) {
      throw new Error(
        `Configuração inválida em ${sourceDescription}: 'search.locations' deve conter pelo menos uma localização/provedor.`,
      );
    }
  }

  private normalizeConfig(raw: any): AppJobConfig {
    const queries: string[] =
      Array.isArray(raw?.search?.queries)
        ? raw.search.queries.map((q: any) => String(q).trim()).filter(Boolean)
        : [];

    const locations: ILocationOption[] =
      Array.isArray(raw?.search?.locations)
        ? raw.search.locations
        : [];

    const providers: string[] | undefined =
      Array.isArray(raw?.search?.providers)
        ? raw.search.providers.map((p: any) => String(p).trim()).filter(Boolean)
        : undefined;

    const profile: Partial<UserProfileCriteria> =
      raw?.profile && typeof raw.profile === 'object'
        ? {
            targetRoles: Array.isArray(raw.profile.targetRoles)
              ? raw.profile.targetRoles
              : [],
            targetTechnologies: Array.isArray(raw.profile.targetTechnologies)
              ? raw.profile.targetTechnologies
              : [],
            acceptableLevels: Array.isArray(raw.profile.acceptableLevels)
              ? raw.profile.acceptableLevels
              : [],
            excludedLevels: Array.isArray(raw.profile.excludedLevels)
              ? raw.profile.excludedLevels
              : [],
            locations: Array.isArray(raw.profile.locations)
              ? raw.profile.locations
              : [],
          }
        : {};

    const classifier: Partial<ClassifierProviderConfig> =
      raw?.classifier && typeof raw.classifier === 'object'
        ? {
            provider: raw.classifier.provider,
            model: raw.classifier.model,
            baseUrl: raw.classifier.baseUrl,
          }
        : {};

    const cvOptimization: Partial<CvOptimizationConfig> =
      raw?.cvOptimization && typeof raw.cvOptimization === 'object'
        ? {
            openRouterModel: raw.cvOptimization.openRouterModel,
            baseCvPath: raw.cvOptimization.baseCvPath,
          }
        : {};

    return {
      search: {
        queries,
        locations,
        providers,
      },
      profile,
      classifier,
      cvOptimization,
    };
  }
}
