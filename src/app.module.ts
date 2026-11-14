import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import { TaskService } from './services/task-service/task-service.service';
import { BotService } from './services/bot/bot.service';
import { JobHistoryRepository } from './repositories/job-history.repository';
import { LinkedinApifyService } from './services/Linkedin/linkedin-apify.service';
import { LioApplyCoreModule } from '@lioapply/core';
import { LioApplyCvModule } from '@lioapply/cv';
import { CvOptimizationService } from './services/cv/cv-optimization.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LioApplyCoreModule.register(),
    LioApplyCvModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    WhatsappService,
    TaskService,
    BotService,
    JobHistoryRepository,
    LinkedinApifyService,
    CvOptimizationService,
  ],
})
export class AppModule {}
