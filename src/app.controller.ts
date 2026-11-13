import {
  Body,
  Controller,
  Get,
  Logger,
  Optional,
  Param,
  Post,
} from '@nestjs/common';
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

    const eventData = Array.isArray(payload?.data)
      ? payload.data[0]
      : payload?.data || payload;
    const messageData = eventData?.message || payload?.message || {};
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
      eventData?.key?.remoteJid || payload?.number || '';
    const isValidPhoneJid = remoteJid.endsWith('@s.whatsapp.net');
    const senderNumber = isValidPhoneJid
      ? remoteJid.split('@')[0]?.replace(/\D/g, '') ||
        process.env.WHATSAPP_NUMBER
      : process.env.WHATSAPP_NUMBER;

    const instanceName =
      payload?.instance || process.env.INSTANCE_NAME || 'job-bot';

    this.logger.log(
      `📥 Comando de currículo recebido via WhatsApp: ${JSON.stringify(command)}`,
    );

    if (senderNumber && instanceName) {
      const targetLabel =
        command.type === 'jobId'
          ? `vaga [#${command.jobId}]`
          : 'descrição/link enviado';
      await this.whatsappService
        .sendMessage({
          instanceName,
          number: senderNumber,
          text: `⏳ *Adaptando seu currículo para a ${targetLabel}...*\nAnalisando requisitos ATS e compilando PDF com Typst.`,
          delay: 500,
        })
        .catch(() => undefined);
    }

    try {
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
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      this.logger.error(
        `❌ Erro ao processar comando /cv no WhatsApp: ${errMsg}`,
      );
      if (senderNumber && instanceName) {
        await this.whatsappService
          .sendMessage({
            instanceName,
            number: senderNumber,
            text: `❌ *Não foi possível gerar o currículo:*\n${errMsg}`,
            delay: 500,
          })
          .catch(() => undefined);
      }
      return { status: 'error', message: errMsg };
    }
  }
}
