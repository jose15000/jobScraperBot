import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PlaywrightService } from './services/playWrightService/scrapservice.service';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import { TaskService } from './services/task-service/task-service.service';
import { BotService } from './services/bot/bot.service';
import { JobHistoryRepository } from './repositories/job-history.repository';
import { JobDigestFormatter } from './services/task-service/job-digest.formatter';
import { LinkedinApifyService } from './services/Linkedin/linkedin-apify.service';
import { JevService } from './services/jev/jev.service';
import { JobDeduplicationService } from './utils/deduplication';
import { JobConfigService } from './config/job-config.service';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [
    AppService,
    PlaywrightService,
    WhatsappService,
    TaskService,
    BotService,
    JevService,
    JobHistoryRepository,
    JobDigestFormatter,
    LinkedinApifyService,
    JobDeduplicationService,
    JobConfigService,
  ],
})
export class AppModule { }
