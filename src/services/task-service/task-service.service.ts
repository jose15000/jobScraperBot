import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule'
import { ScrapserviceService } from '../scrapservice/scrapservice.service';
import type { Isearch } from 'src/interfaces/isearch/isearch.interface';

@Injectable()
export class TaskService {
    private readonly logger = new Logger(TaskService.name);

    constructor() { }

    @Cron(CronExpression.EVERY_MINUTE)
    async runScrapeJob(search: Isearch) {
        try {
   
        }
        catch (error) {
            this.logger.log(error)
        }
    }
}