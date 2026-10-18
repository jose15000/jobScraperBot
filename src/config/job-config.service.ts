import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { AppJobConfig } from '../interfaces/job-config/job-config.interface';
import { DEFAULT_USER_PROFILE, UserProfileCriteria } from '../utils/jev';
import { ILocationOption } from '../interfaces/isearch/isearch.interface';

@Injectable()
export class JobConfigService implements OnModuleInit {
  private readonly logger = new Logger(JobConfigService.name);
  private config!: AppJobConfig;

  onModuleInit() {
    this.loadConfig();
  }

  loadConfig(): AppJobConfig {
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
            return this.config;
          }
        } catch (err) {
          this.logger.error(
            `Erro ao ler/parsear arquivo de configuração em ${configPath}:`,
            err,
          );
        }
      }
    }

    this.logger.log(
      'ℹ️ Nenhum arquivo jobs.config.yaml encontrado. Usando variáveis de ambiente / defaults embutidos.',
    );
    this.config = this.loadFromEnvOrDefaults();
    return this.config;
  }

  getQueries(): string[] {
    return this.config.search.queries;
  }

  getLocations(): ILocationOption[] {
    return this.config.search.locations;
  }

  getUserProfile(): UserProfileCriteria {
    return {
      ...DEFAULT_USER_PROFILE,
      ...(this.config.profile || {}),
    };
  }

  getConfig(): AppJobConfig {
    return this.config;
  }

  private normalizeConfig(raw: any): AppJobConfig {
    const defaultDefaults = this.loadFromEnvOrDefaults();

    const queries: string[] =
      Array.isArray(raw?.search?.queries) && raw.search.queries.length > 0
        ? raw.search.queries.map((q: any) => String(q).trim()).filter(Boolean)
        : defaultDefaults.search.queries;

    const locations: ILocationOption[] =
      Array.isArray(raw?.search?.locations) && raw.search.locations.length > 0
        ? raw.search.locations
        : defaultDefaults.search.locations;

    const profile: Partial<UserProfileCriteria> =
      raw?.profile && typeof raw.profile === 'object'
        ? {
            targetRoles: Array.isArray(raw.profile.targetRoles)
              ? raw.profile.targetRoles
              : undefined,
            targetTechnologies: Array.isArray(raw.profile.targetTechnologies)
              ? raw.profile.targetTechnologies
              : undefined,
            acceptableLevels: Array.isArray(raw.profile.acceptableLevels)
              ? raw.profile.acceptableLevels
              : undefined,
            excludedLevels: Array.isArray(raw.profile.excludedLevels)
              ? raw.profile.excludedLevels
              : undefined,
            locations: Array.isArray(raw.profile.locations)
              ? raw.profile.locations
              : undefined,
          }
        : {};

    return {
      search: {
        queries,
        locations,
      },
      profile,
    };
  }

  private loadFromEnvOrDefaults(): AppJobConfig {
    const envQueries = process.env.SEARCH_QUERIES
      ? process.env.SEARCH_QUERIES.split(',')
          .map((q) => q.trim())
          .filter(Boolean)
      : [
          'desenvolvedor full-stack Júnior',
          'desenvolvedor full-stack pleno',
          'desenvolvedor front-end pleno',
          'desenvolvedor react',
          'desenvolvedor nodejs',
        ];

    return {
      search: {
        queries: envQueries,
        locations: [
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
            },
          },
          {
            provider: 'linkedin',
            label: 'São Paulo',
            workplaceTypes: ['remote', 'onsite', 'hybrid'],
            locationQuery: 'sao-paulo-brasil',
            providerParams: {
              linkedinGeoId: '103501557',
            },
          },
        ],
      },
      profile: DEFAULT_USER_PROFILE,
    };
  }
}
