import { Injectable } from '@nestjs/common';
import { PlaywrightService } from '../playWrightService/scrapservice.service';
import {
  ILocationOption,
  IProviderConfig,
  Isearch,
} from 'src/interfaces/isearch/isearch.interface';
import { WhatsappService } from '../whatsapp-service/whatsapp-service.service';
import {
  SendMediaDocumentDTO,
  SendMessageDTO,
} from 'src/interfaces/SendMessageDTO';
import { ScrapedPost } from 'src/interfaces/ScrapedPost/iscrapedpost.interface';

@Injectable()
export class BotService {
  constructor(
    private readonly scrapService: PlaywrightService,
    private readonly whatsappService: WhatsappService,
  ) {}

  async makeRequest(search: Isearch) {
    return this.scrapService.scrape(search);
  }

  async scrapeProviders(
    providers: IProviderConfig[],
    queries: string[],
    locations: ILocationOption[],
  ): Promise<ScrapedPost[]> {
    if (typeof this.scrapService.scrapeProviders === 'function') {
      return this.scrapService.scrapeProviders(providers, queries, locations);
    }

    const allPosts: ScrapedPost[] = [];
    for (const provider of providers) {
      const posts = await this.makeRequest({
        provider,
        searchQueries: queries,
        location: locations,
      });
      if (Array.isArray(posts)) {
        allPosts.push(...posts);
      }
    }
    return allPosts;
  }

  async sendMessage(content: SendMessageDTO) {
    await this.whatsappService.sendMessage(content);
  }

  async sendMediaDocument(content: SendMediaDocumentDTO) {
    await this.whatsappService.sendMediaDocument(content);
  }
}
