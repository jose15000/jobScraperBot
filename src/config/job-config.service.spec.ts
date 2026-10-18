import { Test, TestingModule } from '@nestjs/testing';
import { JobConfigService } from './job-config.service';
import * as fs from 'fs';

jest.mock('fs');

describe('JobConfigService', () => {
  let service: JobConfigService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.JOBS_CONFIG_YAML;
    delete process.env.JOBS_CONFIG_CONTENT;
    delete process.env.JOBS_CONFIG_BASE64;
    delete process.env.SEARCH_QUERIES;
    delete process.env.SEARCH_LOCATIONS;
    delete process.env.SEARCH_LOCATIONS_JSON;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw an error when no configuration file or environment variables exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);

    expect(() => service.onModuleInit()).toThrow(
      /Configuração ausente: Forneça a variável JOBS_CONFIG_YAML/,
    );
  });

  it('should load configuration from JOBS_CONFIG_YAML environment variable', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    process.env.JOBS_CONFIG_YAML = `
search:
  queries:
    - "dev nestjs pleno"
    - "dev react junior"
  locations:
    - label: "Remoto (Brasil)"
      workplaceTypes: ["remote"]
      locationQuery: "trabalho-remoto"
profile:
  targetTechnologies:
    - "NestJS"
    - "React"
`;

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);
    service.onModuleInit();

    expect(service.getQueries()).toEqual([
      'dev nestjs pleno',
      'dev react junior',
    ]);
    expect(service.getLocations()[0].label).toBe('Remoto (Brasil)');
    expect(service.getUserProfile().targetTechnologies).toEqual([
      'NestJS',
      'React',
    ]);
  });

  it('should load configuration from granular environment variables (SEARCH_QUERIES, etc.)', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    process.env.SEARCH_QUERIES = 'desenvolvedor nodejs, desenvolvedor react';
    process.env.SEARCH_LOCATIONS = 'remoto,curitiba';
    process.env.PROFILE_TARGET_TECHNOLOGIES = 'Node.js,React,TypeScript';

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);
    service.onModuleInit();

    expect(service.getQueries()).toEqual([
      'desenvolvedor nodejs',
      'desenvolvedor react',
    ]);
    expect(service.getLocations().length).toBe(2);
    expect(service.getLocations()[0].label).toBe('Remoto (Brasil)');
    expect(service.getUserProfile().targetTechnologies).toEqual([
      'Node.js',
      'React',
      'TypeScript',
    ]);
  });

  it('should load configuration from yaml file on disk when present', async () => {
    const yamlMock = `
search:
  queries:
    - "frontend vue junior"
    - "backend golang pleno"
  locations:
    - label: "Remoto Global"
      workplaceTypes:
        - "remote"
      locationQuery: "remote"
profile:
  targetTechnologies:
    - "Vue"
    - "Go"
`;
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(yamlMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);
    service.onModuleInit();

    expect(service.getQueries()).toEqual([
      'frontend vue junior',
      'backend golang pleno',
    ]);
    expect(service.getLocations()[0].label).toBe('Remoto Global');
    expect(service.getUserProfile().targetTechnologies).toEqual(['Vue', 'Go']);
  });
});
