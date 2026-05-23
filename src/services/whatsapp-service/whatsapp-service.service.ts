import { Injectable, Logger } from '@nestjs/common';
import { CreateInstanceDto } from 'src/interfaces/ICreateInstanceDTO/icreateinstancedto.interface';
import { SendMessageDTO } from 'src/interfaces/SendMessageDTO';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    async createInstance(data: CreateInstanceDto) {

        this.logger.log(`Creating instance at: ${process.env.evolutionApiUrl}/instance/create`);

        try {
            const payload = {
                integration: 'WHATSAPP-BAILEYS',
                ...data,
            };

            const response = await fetch(`${process.env.evolutionApiUrl}/instance/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.apiKey!,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Failed to create instance: ${response.statusText} - ${errorText}`);
                throw new Error(`Erro ao criar instância: ${response.statusText} - ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
            this.logger.error(`Fetch error during instance creation: ${error.message}`, error.stack);
            throw error;
        }
    }

    async connectInstance(instanceName: string) {
        this.logger.log(`Connecting instance: ${instanceName} at ${process.env.evolutionApiUrl}/instance/connect/${instanceName}`);

        try {
            const response = await fetch(`${process.env.evolutionApiUrl}/instance/connect/${instanceName}`, {
                method: 'GET',
                headers: {
                    'apikey': process.env.apiKey!,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`Failed to connect instance: ${response.statusText} - ${errorText}`);
                throw new Error(`Erro ao conectar instância: ${response.statusText} - ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
            this.logger.error(`Fetch error during instance connection: ${error.message}`, error.stack);
            throw error;
        }
    }

    async sendMessage(message: SendMessageDTO) {
        try {
            const request = await fetch(`${process.env.evolutionApiUrl}/message/sendText/${message.instanceName}`, {
                method: "POST",
                headers: {
                    'apikey': process.env.apiKey!,
                    'Content-Type': "application/json"
                },
                body: JSON.stringify(message)
            })
            return await request.json()
        } catch (error: any) {
            this.logger.log(error.message)
        }
    }
}
