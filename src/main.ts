import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TaskService } from './services/task-service/task-service.service';
import { CvOptimizationService } from './services/cv/cv-optimization.service';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const args = process.argv.slice(2);

  // Mode 1: Lightweight HTTP Webhook Listener (--listen)
  if (args.includes('--listen')) {
    const httpApp = await NestFactory.create(AppModule);
    const port = Number(process.env.PORT || 3000);
    await httpApp.listen(port);
    logger.log(
      `🎧 Receptor de comandos WhatsApp (/webhook/evolution) ativo na porta ${port}.`,
    );
    return;
  }

  let app:
    | Awaited<ReturnType<typeof NestFactory.createApplicationContext>>
    | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule);

    // Mode 2: On-Demand CV Generation via CLI (--cv <jobId | url | text>)
    const cvFlagIndex = args.findIndex(
      (arg) => arg === '--cv' || arg.startsWith('--cv='),
    );
    if (cvFlagIndex !== -1) {
      const flagArg = args[cvFlagIndex];
      const rawTarget = flagArg.includes('=')
        ? flagArg.split('=').slice(1).join('=')
        : args.slice(cvFlagIndex + 1).join(' ');

      if (!rawTarget || !rawTarget.trim()) {
        throw new Error(
          'Informe o ID da vaga ou link/descrição. Exemplo: pnpm cv 42',
        );
      }

      const cvService = app.get(CvOptimizationService);
      const cleanTarget = rawTarget.trim().replace(/^#/, '');
      const numericId = Number(cleanTarget);

      logger.log(
        `📄 Iniciando geração sob demanda de currículo para: "${rawTarget}"...`,
      );

      const result =
        !Number.isNaN(numericId) && /^\d+$/.test(cleanTarget)
          ? await cvService.optimizeForStoredJobId(numericId)
          : await cvService.optimizeForCustomInput(rawTarget);

      const outputDir = path.resolve(process.cwd(), 'result');
      fs.mkdirSync(outputDir, { recursive: true });
      const localFilePath = path.join(outputDir, result.fileName);
      await fs.promises.writeFile(localFilePath, result.pdfBuffer);

      logger.log(
        `✅ Currículo gerado com sucesso: ${localFilePath} | ${result.evaluation.summaryReason}`,
      );
      return;
    }

    // Mode 3 (Default): One-Shot Scheduled Scraping Pipeline
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
