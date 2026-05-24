import { Injectable } from '@nestjs/common';

export interface ApprovedJobDto {
    score: number;
    reason: string;
    url: string;
    previewText: string;
}

@Injectable()
export class JobDigestFormatter {

    format(jobs: ApprovedJobDto[]): string {
        const sortedJobs = [...jobs].sort((a, b) => b.score - a.score);

        const digestTitle = `🚀 *Varredura Completa: ${sortedJobs.length} Novas Vagas Encontradas!* 🚀\n\n`;
        const digestBody = sortedJobs.map((job, index) => {
            return [
                `*${index + 1}️⃣ Vaga Aprovada (Score: ${job.score})*`,
                `📋 *Motivo:* ${job.reason}`,
                `📝 *Resumo:* _"${job.previewText}..."_`,
                job.url ? `🔗 *Link:* ${job.url}` : '',
                '──────────────────'
            ].filter(Boolean).join('\n');
        }).join('\n\n');

        return digestTitle + digestBody;
    }
}
