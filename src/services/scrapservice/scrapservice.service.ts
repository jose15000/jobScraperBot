import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Isearch } from 'src/interfaces/isearch/isearch.interface';
import * as cheerio from 'cheerio';
import { desiredTechs } from 'src/utils/heuristics';

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
                let searchUrl = '';

                switch (search.provider) {

                    case "glassdoor":
                        searchUrl = `${process.env.GLASSDOOR_URL}`;
                        break;

                    default:
                        this.logger.warn(`Provider desconhecido: ${search.provider}`);
                        continue;
                }
                this.logger.log(`Navegando para: ${searchUrl}`);
                await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

                try {

                    if (search.provider === 'glassdoor') {

                        await page.waitForSelector('article, [data-test="jobListing"]', { timeout: 30000 });
                    }
                } catch (e) {
                    this.logger.warn(`Aviso: Elemento principal não apareceu a tempo para a query: ${query}`);
                }
                await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);

                const html = await page.content();

                let jobs: ScrapedPost[] = [];
                if (search.provider === "glassdoor") {
                    jobs = this.parseGlassdoorJobsHtml(html);
                }

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

    private parseGlassdoorJobsHtml(html: string): ScrapedPost[] {
        const $ = cheerio.load(html);
        const jobs: ScrapedPost[] = [];

        $('[data-test="jobListing"]').each((i, element) => {
            const jobTitle = $(element).find('[data-test="job-title"]').text().trim();
            const companyName = $(element).find('[class*="EmployerProfile"]').first().text().trim();

            const postText = `Vaga: ${jobTitle} | Empresa: ${companyName}`;

            let postUrl = $(element).find('a[data-test="job-title"]').attr('href') || '';

            if (postUrl && !postUrl.startsWith('http')) {
                postUrl = `https://www.glassdoor.com.br${postUrl}`;
            }

            if (jobTitle) {
                jobs.push({ text: postText, url: postUrl });
            }
        });

        return jobs;
    }
}
