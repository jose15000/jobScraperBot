import { Injectable } from '@nestjs/common';
import { runJobHeuristic, FilterResult } from '../../utils/heuristics';
import { ScrapserviceService } from '../scrapservice/scrapservice.service';
import { Isearch } from 'src/interfaces/isearch/isearch.interface';
import { WhatsappService } from '../whatsapp-service/whatsapp-service.service';
import { SendMessageDTO } from 'src/interfaces/SendMessageDTO';

@Injectable()
export class BotService {

    constructor(private readonly scrapService: ScrapserviceService,
        private readonly whatsappService: WhatsappService,
    ) { }

    async makeRequest(queries: Isearch) {
        const content = await this.scrapService.scrape(queries);
        return content;
    }

    async filterJobs(content: string): Promise<FilterResult> {
        return runJobHeuristic(content);
    }

    async sendMessage(content: SendMessageDTO) {
        await this.whatsappService.sendMessage(content)
    }
}
