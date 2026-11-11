import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TaskService } from './services/task-service/task-service.service';
import { Logger } from '@nestjs/common';
import { PlaywrightService } from './services/playWrightService/scrapservice.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule);
    logger.log('🚀 Container iniciado — executando pipeline de scraping...');
    const taskService = app.get(TaskService);
    await taskService.runScrapeJob();
  } catch (error) {
    logger.error('❌ Erro fatal no pipeline:', error);
    await app?.close();
    process.exit(1);
  } finally {
    await app?.close();
    process.exit(0);
  }
}
bootstrap();
