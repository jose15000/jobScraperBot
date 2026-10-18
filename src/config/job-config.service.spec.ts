import { Test, TestingModule } from '@nestjs/testing';
import { JobConfigService } from './job-config.service';
import * as fs from 'fs';

jest.mock('fs');

describe('JobConfigService', () => {
  let service: JobConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JobConfigService],
    }).compile();

    service = module.get<JobConfigService>(JobConfigService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return default queries when no file exists', () => {
    const queries = service.getQueries();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries).toContain('desenvolvedor full-stack Júnior');
  });

  it('should return default locations when no file exists', () => {
    const locations = service.getLocations();
    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0].label).toBe('Remoto (Brasil)');
  });

  it('should load configuration from yaml file when present', () => {
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

    service.loadConfig();

    expect(service.getQueries()).toEqual([
      'frontend vue junior',
      'backend golang pleno',
    ]);
    expect(service.getLocations()[0].label).toBe('Remoto Global');
    expect(service.getUserProfile().targetTechnologies).toEqual(['Vue', 'Go']);
  });
});
