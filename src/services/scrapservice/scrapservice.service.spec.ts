import { Test, TestingModule } from '@nestjs/testing';
import { ScrapserviceService } from './scrapservice.service';

describe('ScrapserviceService', () => {
  let service: ScrapserviceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScrapserviceService],
    }).compile();

    service = module.get<ScrapserviceService>(ScrapserviceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
