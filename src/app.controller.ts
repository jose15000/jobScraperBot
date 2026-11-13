import { Body, Controller, Get, Logger, Optional, Param, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { PlaywrightService } from './services/playWrightService/scrapservice.service';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import { TaskService } from './services/task-service/task-service.service';
import { CvOptimizationService } from './services/cv/cv-optimization.service';
import type { CreateInstanceDto } from './interfaces/ICreateInstanceDTO/icreateinstancedto.interface';
import type { SendMessageDTO } from './interfaces/SendMessageDTO';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly scrapService: PlaywrightService,
    private readonly whatsappService: WhatsappService,
    private readonly taskService: TaskService,
    @Optional() private readonly cvOptimizationService?: CvOptimizationService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('instance/create')
  async create(@Body() data: CreateInstanceDto) {
    return await this.whatsappService.createInstance(data);
  }

  @Get('instance/connect/:instanceName')
  async connect(@Param('instanceName') instanceName: string) {
    return await this.whatsappService.connectInstance(instanceName);
  }

  @Post('message/sendText/:instanceName')
  async sendMessage(
    @Body() data: SendMessageDTO,
    @Param('instanceName') instanceName: string,
  ) {
    return await this.whatsappService.sendMessage(data);
  }

  /**
   * Evolution API Webhook listener for on-demand CV generation ("/cv <id>" or "/cv <url/description>")
   */
  @Post('webhook/evolution')
  async handleEvolutionWebhook(@Body() payload: Record<string, any>) {
    if (!this.cvOptimizationService) {
      return { status: 'ignored', reason: 'CvOptimizationService unavailable' };
    }

    const messageData = payload?.data?.message || payload?.message || {};
    const text =
      messageData?.conversation ||
      messageData?.extendedTextMessage?.text ||
      payload?.text ||
      '';

    const command = this.cvOptimizationService.parseCvCommand(String(text));
    if (!command) {
      return { status: 'ignored' };
    }

    const remoteJid: string =
      payload?.data?.key?.remoteJid || payload?.number || '';
    const senderNumber =
      remoteJid.split('@')[0]?.replace(/\D/g, '') ||
      process.env.WHATSAPP_NUMBER;

    this.logger.log(
      `📥 Comando de currículo recebido via WhatsApp: ${JSON.stringify(command)}`,
    );

    if (command.type === 'jobId') {
      const result = await this.cvOptimizationService.optimizeForStoredJobId(
        command.jobId,
        { sendWhatsapp: true, recipientNumber: senderNumber },
      );
      return {
        status: 'completed',
        fileName: result.fileName,
        evaluation: result.evaluation,
      };
    }

    const result = await this.cvOptimizationService.optimizeForCustomInput(
      command.input,
      { sendWhatsapp: true, recipientNumber: senderNumber },
    );
    return {
      status: 'completed',
      fileName: result.fileName,
      evaluation: result.evaluation,
    };
  }
}
