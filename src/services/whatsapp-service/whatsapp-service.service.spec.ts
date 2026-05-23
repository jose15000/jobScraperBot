import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappServiceService } from './whatsapp-service.service';

describe('WhatsappServiceService', () => {
  let service: WhatsappServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappServiceService],
    }).compile();

    service = module.get<WhatsappServiceService>(WhatsappServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
