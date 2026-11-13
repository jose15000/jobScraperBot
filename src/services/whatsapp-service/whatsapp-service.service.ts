import { Injectable, Logger } from '@nestjs/common';
import { CreateInstanceDto } from 'src/interfaces/ICreateInstanceDTO/icreateinstancedto.interface';
import {
  SendMediaDocumentDTO,
  SendMessageDTO,
} from 'src/interfaces/SendMessageDTO';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  async createInstance(data: CreateInstanceDto) {
    this.logger.log(
      `Creating instance at: ${process.env.evolutionApiUrl}/instance/create`,
    );

    try {
      const payload = {
        integration: 'WHATSAPP-BAILEYS',
        ...data,
      };

      const response = await fetch(
        `${process.env.evolutionApiUrl}/instance/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.apiKey!,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to create instance: ${response.statusText} - ${errorText}`,
        );
        throw new Error(
          `Erro ao criar instância: ${response.statusText} - ${errorText}`,
        );
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error(
        `Fetch error during instance creation: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async connectInstance(instanceName: string) {
    this.logger.log(
      `Connecting instance: ${instanceName} at ${process.env.evolutionApiUrl}/instance/connect/${instanceName}`,
    );

    try {
      const response = await fetch(
        `${process.env.evolutionApiUrl}/instance/connect/${instanceName}`,
        {
          method: 'GET',
          headers: {
            apikey: process.env.apiKey!,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to connect instance: ${response.statusText} - ${errorText}`,
        );
        throw new Error(
          `Erro ao conectar instância: ${response.statusText} - ${errorText}`,
        );
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error(
        `Fetch error during instance connection: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async sendMessage(message: SendMessageDTO) {
    const baseUrl =
      process.env.evolutionApiUrl || process.env.EVOLUTION_API_URL;
    const url = `${baseUrl}/message/sendText/${message.instanceName}`;
    this.logger.log(`📤 Enviando mensagem para: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: process.env.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const body = await response.text();

      if (!response.ok) {
        this.logger.error(
          `❌ Erro ao enviar mensagem (${response.status}): ${body}`,
        );
        throw new Error(
          `Falha ao enviar mensagem na Evolution API (${response.status}): ${body}`,
        );
      }

      this.logger.log(`✅ Mensagem enviada com sucesso!`);
      return JSON.parse(body);
    } catch (error: any) {
      this.logger.error(`❌ Fetch falhou: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendMediaDocument(mediaDto: SendMediaDocumentDTO) {
    const baseUrl =
      process.env.evolutionApiUrl || process.env.EVOLUTION_API_URL;
    const url = `${baseUrl}/message/sendMedia/${mediaDto.instanceName}`;
    this.logger.log(
      `📤 Enviando documento PDF (${mediaDto.fileName}) para: ${url}`,
    );

    const cleanBase64 = mediaDto.base64Pdf.replace(
      /^data:application\/pdf;base64,/,
      '',
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: process.env.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: mediaDto.number,
          mediatype: 'document',
          mimetype: 'application/pdf',
          caption: mediaDto.caption || '',
          media: cleanBase64,
          fileName: mediaDto.fileName,
        }),
      });

      const body = await response.text();

      if (!response.ok) {
        this.logger.error(
          `❌ Erro ao enviar documento PDF (${response.status}): ${body}`,
        );
        throw new Error(
          `Falha ao enviar documento PDF na Evolution API (${response.status}): ${body}`,
        );
      }

      this.logger.log(`✅ Documento PDF enviado com sucesso no WhatsApp!`);
      return JSON.parse(body);
    } catch (error: any) {
      this.logger.error(
        `❌ Fetch falhou no envio de PDF: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
