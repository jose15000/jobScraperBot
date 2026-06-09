import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Isearch, IProviderConfig } from 'src/interfaces/isearch/isearch.interface';
import * as cheerio from 'cheerio';

export interface ScrapedPost {
    text: string;
    url: string;
    jobId?: string;
    title?: string;
    company?: string;
    location?: string;
    link?: string;
}

@Injectable()
export class ScrapserviceService {
    private readonly logger = new Logger(ScrapserviceService.name);

    async startBrowser(): Promise<{ browser: Browser, context: BrowserContext, page: Page }> {
        const browser: Browser = await chromium.launch({
            headless: true,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ],
        });

        const context: BrowserContext = await browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport: { width: 1280, height: 720 },
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo'
        });

        const page: Page = await context.newPage();

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        return { browser, context, page }
    }

    async scrape(search: Isearch): Promise<ScrapedPost[]> {
        const { browser, page } = await this.startBrowser();
        const allJobs: ScrapedPost[] = [];

        try {
            for (const query of search.searchQueries) {
                const searchUrl = search.provider.buildSearchUrl(query);
                this.logger.log(`Navegando para: ${searchUrl}`);

                await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

                try {
                    await page.waitForSelector(search.provider.selectors.waitSelector, { timeout: 30000 });
                } catch (e) {
                    this.logger.warn(`Aviso: Elemento principal não apareceu a tempo para a query: ${query}`);
                }

                await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);

                const html = await page.content();
                const jobs = this.ParseHtml(html, search.provider);
                allJobs.push(...jobs);
            }
        } catch (error) {
            this.logger.error("Erro crítico no processo de scrape:", error);
            throw error;
        } finally {
            await browser.close();
        }

        return allJobs;
    }

    private ParseHtml(html: string, provider: IProviderConfig): ScrapedPost[] {
        const $ = cheerio.load(html);
        const jobs: ScrapedPost[] = [];
        const { selectors } = provider;

        $(selectors.container).each((i, element) => {
            const jobTitle = $(element).find(selectors.jobTitle).text().trim();
            const companyName = $(element).find(selectors.companyName).first().text().trim();

            const postText = `Vaga: ${jobTitle} | Empresa: ${companyName}`;

            let postUrl = $(element).find(selectors.jobLink).attr('href') || '';

            if (postUrl && !postUrl.startsWith('http')) {
                const cleanBaseUrl = selectors.baseUrl.endsWith('/') ? selectors.baseUrl.slice(0, -1) : selectors.baseUrl;
                const cleanPostUrl = postUrl.startsWith('/') ? postUrl : `/${postUrl}`;
                postUrl = `${cleanBaseUrl}${cleanPostUrl}`;
            }

            if (jobTitle) {
                jobs.push({ text: postText, url: postUrl });
            }
        });

        return jobs;
    }

    async scrapeLinkedinPosts(query: string[]): Promise<ScrapedPost[]> {
        try {
            this.logger.log(`Executando Apify Actor em modo síncrono. Aguardando resultados de ${query.length} queries...`);

            const request = await fetch(`${process.env.APIFY_URL!}`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    maxPosts: 20,
                    postNestedComments: false,
                    postNestedReactions: false,
                    postedLimit: "24h",
                    scrapeComments: false,
                    scrapeReactions: false,
                    searchQueries: query,
                    sortBy: "date"
                })
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
                    title: 'Vaga via LinkedIn Post'
                }));
            }

            return [];
        } catch (error: any) {
            this.logger.error(`Erro ao buscar posts do LinkedIn: ${error.message}`, error.stack);
            throw error;
        }
    }
}
