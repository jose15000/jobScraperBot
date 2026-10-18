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
        this.logger.error(
          `Erro ao parsear JOBS_CONFIG_YAML da variável de ambiente: ${err.message}`,
        );
        throw err;
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
        this.logger.error(
          `Erro ao parsear JOBS_CONFIG_BASE64 da variável de ambiente: ${err.message}`,
        );
        throw err;
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
