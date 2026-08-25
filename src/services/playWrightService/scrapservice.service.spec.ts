import { Test, TestingModule } from '@nestjs/testing';
import { PlaywrightService } from './scrapservice.service';

describe('PlaywrightService', () => {
  let service: PlaywrightService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaywrightService],
    }).compile();

    service = module.get<PlaywrightService>(PlaywrightService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
