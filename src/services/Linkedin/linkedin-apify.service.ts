import { Injectable, Logger } from '@nestjs/common';
import { ScrapedPost } from 'src/interfaces/ScrapedPost/iscrapedpost.interface';

@Injectable()
export class LinkedinApifyService {
  private readonly logger = new Logger(LinkedinApifyService.name);
  async scrapeLinkedinPosts(query: string[]): Promise<ScrapedPost[]> {
    try {
      this.logger.log(
        `Executando Apify Actor em modo síncrono. Aguardando resultados de ${query.length} queries...`,
      );

      const request = await fetch(`${process.env.APIFY_URL!}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPosts: 20,
          postNestedComments: false,
          postNestedReactions: false,
          postedLimit: '24h',
          scrapeComments: false,
          scrapeReactions: false,
          searchQueries: query,
          sortBy: 'date',
        }),
      });

      if (!request.ok) {
        const errText = await request.text();
        this.logger.error(`Erro no Apify API (${request.status}): ${errText}`);
        throw new Error(`Apify error: ${request.statusText}`);
      }

      const response = await request.json();

      if (Array.isArray(response)) {
        return response.map((item: any) => ({
          text: item.content || '',
          url: item.linkedinUrl || '',
          company: item.author?.name || '',
          title: 'Vaga via LinkedIn Post',
        }));
      }

      return [];
    } catch (error: any) {
      this.logger.error(
        `Erro ao buscar posts do LinkedIn: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
