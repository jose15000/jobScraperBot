import { Injectable } from '@nestjs/common';
import { Isearch } from 'src/interfaces/isearch/isearch.interface';


@Injectable()
export class ScrapserviceService {

    async scrape(search: Isearch) {
        try {
            const response = await fetch(`${process.env.APIFY_URL}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contentType: "all",
                    maxPosts: 20,
                    maxReactions: 5,
                    postNestedComments: false,
                    postNestedReactions: false,
                    postedLimit: "1h",
                    profileScraperMode: "short",
                    scrapeComments: false,
                    scrapeReactions: false,
                    sortBy: "date",
                    ...search,
                }),
            });

            if (!response.ok) {
                throw new Error(`Erro na API do Apify: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Erro no processo de scrape:", error);
            throw error;
        }
    }
}
