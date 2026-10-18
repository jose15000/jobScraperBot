import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task-service.service';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter } from './job-digest.formatter';
import { JevService } from '../jev/jev.service';
import { LinkedinApifyService } from '../Linkedin/linkedin-apify.service';
import { JobDeduplicationService } from '../../utils/deduplication';
import { JobConfigService } from '../../config/job-config.service';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(async () => {
    const mockBotService = {
      makeRequest: jest.fn(),
      sendMessage: jest.fn(),
    };

    const mockJevService = {
      evaluateJob: jest.fn(),
    };

    const mockJobDeduplicationService = {
      normalize: jest.fn(),
      createKey: jest.fn(),
      isDuplicate: jest.fn(),
      createKeySet: jest.fn().mockReturnValue(new Set()),
      deduplicate: jest.fn(),
    };

    const mockJobConfigService = {
      getQueries: jest.fn().mockReturnValue(['desenvolvedor full-stack Júnior']),
      getLocations: jest.fn().mockReturnValue([]),
      getUserProfile: jest.fn().mockReturnValue({}),
    };

    const mockHistoryRepository = {
      exists: jest.fn(),
      existsExactUrl: jest.fn(),
      existsByTitleAndCompany: jest.fn(),
      getRecentJobs: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    const mockLinkedinApifyService = {
      getPosts: jest.fn(),
    };

    const mockDigestFormatter = {
      format: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: BotService, useValue: mockBotService },
        { provide: JevService, useValue: mockJevService },
        { provide: JobHistoryRepository, useValue: mockHistoryRepository },
        { provide: LinkedinApifyService, useValue: mockLinkedinApifyService },
        { provide: JobDigestFormatter, useValue: mockDigestFormatter },
        { provide: JobDeduplicationService, useValue: mockJobDeduplicationService },
        { provide: JobConfigService, useValue: mockJobConfigService },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
