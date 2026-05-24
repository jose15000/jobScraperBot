import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from './bot.service';
import { ScrapserviceService } from '../scrapservice/scrapservice.service';
import { WhatsappService } from '../whatsapp-service/whatsapp-service.service';

describe('BotService', () => {
  let service: BotService;

  beforeEach(async () => {
    const mockScrapService = {
      scrape: jest.fn(),
    };

    const mockWhatsappService = {
      sendMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: ScrapserviceService, useValue: mockScrapService },
        { provide: WhatsappService, useValue: mockWhatsappService },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
