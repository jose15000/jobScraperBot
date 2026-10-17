import { Injectable } from '@nestjs/common';
import { PlaywrightService } from '../playWrightService/scrapservice.service';
import { Isearch } from 'src/interfaces/isearch/isearch.interface';
import { WhatsappService } from '../whatsapp-service/whatsapp-service.service';
import { SendMessageDTO } from 'src/interfaces/SendMessageDTO';

@Injectable()
export class BotService {
  constructor(
    private readonly scrapService: PlaywrightService,
    private readonly whatsappService: WhatsappService,
  ) { }

  async makeRequest(search: Isearch) {
    const content = await this.scrapService.scrape(search);
    return content;
  }

  async sendMessage(content: SendMessageDTO) {
    await this.whatsappService.sendMessage(content);
  }
}
