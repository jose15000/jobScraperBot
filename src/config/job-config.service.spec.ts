import { Test, TestingModule } from '@nestjs/testing';
import { JobConfigService } from './job-config.service';
import * as fs from 'fs';

jest.mock('fs');

describe('JobConfigService', () => {
  let service: JobConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it('should throw an error when no configuration file or environment variables exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    delete process.env.SEARCH_QUERIES;

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);

    expect(() => service.onModuleInit()).toThrow(
      /Configuração ausente: Crie o arquivo 'jobs.config.yaml'/,
    );
  });

  it('should load configuration from yaml file when present', async () => {
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
    expect(service.getUserProfile().targetRoles).toEqual([]);
  });

  it('should throw validation error when search.queries is empty', async () => {
    const invalidYaml = `
search:
  queries: []
  locations:
    - label: "Remoto"
      workplaceTypes: ["remote"]
      locationQuery: "remoto"
`;
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(invalidYaml);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);

    expect(() => service.onModuleInit()).toThrow(
      /search.queries.*deve conter pelo menos uma query/,
    );
  });

  it('should throw validation error when search.locations is empty', async () => {
    const invalidYaml = `
search:
  queries:
    - "developer react"
  locations: []
`;
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(invalidYaml);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);

    expect(() => service.onModuleInit()).toThrow(
      /search.locations.*deve conter pelo menos uma localização/,
    );
  });
});
