import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TaskService } from './services/task-service/task-service.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    logger.log('🚀 Container iniciado — executando pipeline de scraping...');
    const taskService = app.get(TaskService);
    await taskService.runScrapeJob();
    logger.log('✅ Pipeline finalizado com sucesso.');
  } catch (error) {
    logger.error('❌ Erro fatal no pipeline:', error);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}
bootstrap();
