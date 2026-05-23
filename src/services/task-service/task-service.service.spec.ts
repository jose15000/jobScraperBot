import { Test, TestingModule } from '@nestjs/testing';
import { TaskServiceService } from './task-service.service';

describe('TaskServiceService', () => {
  let service: TaskServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskServiceService],
    }).compile();

    service = module.get<TaskServiceService>(TaskServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
