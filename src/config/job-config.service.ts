import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { AppJobConfig } from '../interfaces/job-config/job-config.interface';
import { UserProfileCriteria } from '../utils/jev';
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

    // Fallback opcional por variável de ambiente (sem queries hardcoded)
    if (process.env.SEARCH_QUERIES) {
      this.logger.log('📄 Configuração carregada via variável SEARCH_QUERIES.');
      const queries = process.env.SEARCH_QUERIES.split(',')
        .map((q) => q.trim())
        .filter(Boolean);

      this.config = {
        search: {
          queries,
          locations: [],
        },
        profile: {},
      };
      return this.config;
    }

    throw new Error(
      "Configuração ausente: Crie o arquivo 'jobs.config.yaml' na raiz do projeto (use 'jobs.config.example.yaml' como modelo) ou defina as variáveis necessárias.",
    );
  }

  getQueries(): string[] {
    return this.config.search.queries;
  }

  getLocations(): ILocationOption[] {
    return this.config.search.locations;
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

  private validateConfig(config: AppJobConfig, configPath: string) {
    if (!config.search?.queries || config.search.queries.length === 0) {
      throw new Error(
        `Configuração inválida em ${configPath}: 'search.queries' deve conter pelo menos uma query de busca.`,
      );
    }
    if (!config.search?.locations || config.search.locations.length === 0) {
      throw new Error(
        `Configuração inválida em ${configPath}: 'search.locations' deve conter pelo menos uma localização/provedor.`,
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

    return {
      search: {
        queries,
        locations,
      },
      profile,
    };
  }
}
