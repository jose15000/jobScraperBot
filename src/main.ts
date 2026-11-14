import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TaskService } from './services/task-service/task-service.service';
import { CvOptimizationService } from './services/cv/cv-optimization.service';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { createLioApplyMcpServer } from './packages/mcp';

async function registerEvolutionWebhook(port: number, logger: Logger) {
  const baseUrl =
    process.env.evolutionApiUrl ||
    process.env.EVOLUTION_API_URL ||
    'http://localhost:8080';
  const apiKey = process.env.apiKey || process.env.AUTHENTICATION_API_KEY;
  const instanceName = process.env.INSTANCE_NAME;

  if (!apiKey || !instanceName) {
    logger.warn(
      '⚠️ apiKey ou INSTANCE_NAME ausentes no .env — pulando auto-registro de webhook na Evolution API.',
    );
    return;
  }

  const webhookHost = process.env.WEBHOOK_HOST_IP || '172.17.0.1';
  const webhookUrl =
    process.env.WEBHOOK_PUBLIC_URL ||
    `http://${webhookHost}:${port}/webhook/evolution`;

  try {
    const response = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        },
      }),
    });

    if (response.ok) {
      logger.log(
        `🔗 Webhook registrado automaticamente na Evolution API (${instanceName}) -> ${webhookUrl}`,
      );
    } else {
      const errText = await response.text();
      logger.warn(
        `⚠️ Evolution API retornou status ${response.status} ao registrar webhook: ${errText}`,
      );
    }
  } catch (err: any) {
    logger.warn(
      `⚠️ Não foi possível registrar webhook na Evolution API (${err.message}).`,
    );
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const args = process.argv.slice(2);

  // Mode 0: MCP Server over stdio (--mcp)
  if (args.includes('--mcp')) {
    const mcpServer = createLioApplyMcpServer();
    mcpServer.startStdio();
    return;
  }

  // Mode 1: Lightweight HTTP Webhook Listener (--listen)
  if (args.includes('--listen')) {
    const httpApp = await NestFactory.create(AppModule);
    const port = Number(process.env.PORT || 3000);
    await httpApp.listen(port, '0.0.0.0');
    logger.log(
      `🎧 Receptor de comandos WhatsApp (/webhook/evolution) ativo em 0.0.0.0:${port}.`,
    );
    await registerEvolutionWebhook(port, logger);
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
