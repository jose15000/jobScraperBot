import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class JobHistoryRepository {
    private readonly logger = new Logger(JobHistoryRepository.name);
    private readonly historyFilePath = path.join(process.cwd(), 'vagas-enviadas.json');
    private readonly MAX_HISTORY_SIZE = 1000;

    exists(url: string): boolean {
        if (!url) return false;
        const history = this.load();
        return history.includes(url);
    }

    save(urls: string[]): void {
        try {
            const currentHistory = this.load();
            const updatedHistory = Array.from(new Set([...currentHistory, ...urls]));
        
            if (updatedHistory.length > this.MAX_HISTORY_SIZE) {
                updatedHistory.splice(0, updatedHistory.length - this.MAX_HISTORY_SIZE);
            }
            
            fs.writeFileSync(this.historyFilePath, JSON.stringify(updatedHistory, null, 2), 'utf-8');
        } catch (error) {
            this.logger.error('Erro ao persistir histórico de vagas enviadas no disco:', error);
        }
    }

    private load(): string[] {
        try {
            if (fs.existsSync(this.historyFilePath)) {
                const data = fs.readFileSync(this.historyFilePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.logger.error('Erro ao carregar histórico de vagas enviadas do disco:', error);
        }
        return [];
    }
}
