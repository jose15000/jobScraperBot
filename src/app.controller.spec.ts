import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScrapserviceService } from './services/scrapservice/scrapservice.service';
import { WhatsappService } from './services/whatsapp-service/whatsapp-service.service';
import { TaskService } from './services/task-service/task-service.service';
import type { CreateInstanceDto } from './interfaces/ICreateInstanceDTO/icreateinstancedto.interface';
import type { SendMessageDTO } from './interfaces/SendMessageDTO';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<AppService>;
  let scrapserviceService: jest.Mocked<ScrapserviceService>;
  let whatsappService: jest.Mocked<WhatsappService>;
  let taskService: jest.Mocked<TaskService>;

  beforeEach(async () => {
    const mockAppService = {
      getHello: jest.fn().mockReturnValue('Hello World!'),
    };

    const mockScrapService = {
      scrape: jest.fn(),
    };

    const mockWhatsappService = {
      createInstance: jest.fn(),
      connectInstance: jest.fn(),
      sendMessage: jest.fn(),
    };

    const mockTaskService = {
      runScrapeJob: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
        { provide: ScrapserviceService, useValue: mockScrapService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: TaskService, useValue: mockTaskService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get(AppService);
    scrapserviceService = app.get(ScrapserviceService);
    whatsappService = app.get(WhatsappService);
    taskService = app.get(TaskService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
      expect(appService.getHello).toHaveBeenCalled();
    });
  });

  describe('testCron', () => {
    it('should trigger runScrapeJob and return success message', async () => {
      taskService.runScrapeJob.mockResolvedValue(undefined);

      const result = await appController.testCron();

      expect(taskService.runScrapeJob).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Scrape triggered manually' });
    });
  });

  describe('createInstance', () => {
    it('should create a WhatsApp instance', async () => {
      const data: CreateInstanceDto = { instanceName: 'test-instance' };
      whatsappService.createInstance.mockResolvedValue({ success: true });

      const result = await appController.create(data);

      expect(whatsappService.createInstance).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true });
    });
  });

  describe('connectInstance', () => {
    it('should connect a WhatsApp instance', async () => {
      const instanceName = 'test-instance';
      whatsappService.connectInstance.mockResolvedValue({ base64: 'qr-code-data' });

      const result = await appController.connect(instanceName);

      expect(whatsappService.connectInstance).toHaveBeenCalledWith(instanceName);
      expect(result).toEqual({ base64: 'qr-code-data' });
    });
  });

  describe('sendMessage', () => {
    it('should send a WhatsApp message', async () => {
      const instanceName = 'test-instance';
      const data: SendMessageDTO = {
        number: '5511999999999',
        text: 'Hello from test',
        instanceName: 'test-instance',
        delay: 1000
      };
      whatsappService.sendMessage.mockResolvedValue({ message: 'Sent' });

      const result = await appController.sendMessage(data, instanceName);

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(data);
      expect(result).toEqual({ message: 'Sent' });
    });
  });
});
