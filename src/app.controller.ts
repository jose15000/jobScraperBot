import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { ScrapserviceService } from './services/scrapservice/scrapservice.service';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import type { CreateInstanceDto } from './interfaces/ICreateInstanceDTO/icreateinstancedto.interface';
import type { SendMessageDTO } from './interfaces/SendMessageDTO';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly scrapService: ScrapserviceService,
    private readonly whatsappService: WhatsappService
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-scrape')
  async testScrape() {
    return await this.scrapService.scrape({
      searchQueries: [`"vaga" AND "react" AND "junior" AND "remoto"`],
    });
  }

  @Post('instance/create')
  async create(@Body() data: CreateInstanceDto) {
    return await this.whatsappService.createInstance(data)
  }

  @Get('instance/connect/:instanceName')
  async connect(@Param('instanceName') instanceName: string) {
    return await this.whatsappService.connectInstance(instanceName);
  }

  @Post('message/sendText/:instanceName')
  async sendMessage(@Body() data: SendMessageDTO, @Param('instanceName') instanceName: string) {
    return await this.whatsappService.sendMessage(data)
  }
}
