import { Injectable } from '@nestjs/common';

export interface ApprovedJobDto {
  id?: number;
  title?: string;
  company?: string;
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
    const digestBody = sortedJobs
      .map((job, index) => {
        const idBadge = job.id ? ` [#${job.id}]` : '';
        const titleLabel = job.title
          ? ` — *${job.title}*${job.company ? ` (${job.company})` : ''}`
          : '';
        return [
          `*${index + 1}️${idBadge}*${titleLabel}`,
          `📝 *Resumo:* _"${job.previewText}..."_`,
          job.url && job.url.startsWith('http') ? `🔗 *Link:* ${job.url}` : '',
          '──────────────────',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    const exampleId = sortedJobs.find((j) => j.id)?.id || 1;
    const footer = `\n\n📄 *Para gerar currículo otimizado para uma vaga, responda:* \`/cv <ID>\` _(ex: /cv ${exampleId})_`;

    return digestTitle + digestBody + footer;
  }
}
