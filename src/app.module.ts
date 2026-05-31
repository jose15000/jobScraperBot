import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config'
import { ScrapserviceService } from './services/scrapservice/scrapservice.service';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import { TaskService } from './services/task-service/task-service.service';
import { BotService } from './services/bot/bot.service';
import { JobHistoryRepository } from './repositories/job-history.repository';
import { JobDigestFormatter } from './services/task-service/job-digest.formatter';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [
    AppService,
    ScrapserviceService,
    WhatsappService,
    TaskService,
    BotService,
    JobHistoryRepository,
    JobDigestFormatter,
  ],
})
export class AppModule { }
