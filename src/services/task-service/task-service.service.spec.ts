import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task-service.service';
import { BotService } from '../bot/bot.service';
import { JobHistoryRepository } from '../../repositories/job-history.repository';
import { JobDigestFormatter } from './job-digest.formatter';

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(async () => {
    const mockBotService = {
      makeRequest: jest.fn(),
      filterJobs: jest.fn(),
      sendMessage: jest.fn(),
    };

    const mockHistoryRepository = {
      exists: jest.fn(),
      save: jest.fn(),
    };

    const mockDigestFormatter = {
      format: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskService,
        { provide: BotService, useValue: mockBotService },
        { provide: JobHistoryRepository, useValue: mockHistoryRepository },
        { provide: JobDigestFormatter, useValue: mockDigestFormatter },
      ],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
