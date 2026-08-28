import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  Isearch,
  IProviderConfig,
} from 'src/interfaces/isearch/isearch.interface';
import * as cheerio from 'cheerio';
import { ScrapedPost } from 'src/interfaces/ScrapedPost/iscrapedpost.interface';

@Injectable()
export class PlaywrightService {
  private readonly logger = new Logger(PlaywrightService.name);

  async startBrowser(): Promise<{
    browser: Browser;
    context: BrowserContext;
    page: Page;
  }> {
    const browser: Browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
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

    return { browser, context, page };
  }

  async scrape(search: Isearch): Promise<ScrapedPost[]> {
    const { browser, context } = await this.startBrowser();
    const allJobs: ScrapedPost[] = [];

    const targetLocations = search.location!;
    const tasks: { query: string; locOption: any }[] = [];

    for (const query of search.searchQueries) {
      for (const locOption of targetLocations) {
        // Ignora buscas presenciais/híbridas em plataformas exclusivas de vagas remotas
        if (
          search.provider.name === 'remotar' &&
          !locOption.workplaceTypes?.includes('remote')
        ) {
          continue;
        }
        tasks.push({ query, locOption });
      }
    }

    try {
      // Executa as requisições em abas concorrentes em paralelo
      const pageResults = await Promise.all(
        tasks.map(async ({ query, locOption }) => {
          const page = await context.newPage();
          try {
            await page.route('**/*', (route) => {
              const resourceType = route.request().resourceType();
              if (['image', 'media', 'font'].includes(resourceType)) {
                route.abort();
              } else {
                route.continue();
              }
            });

            const searchUrl = search.provider.buildSearchUrl(query, locOption);
            this.logger.log(
              `[${search.provider.name}] (${locOption.label || 'Busca'}) Navegando para: ${searchUrl}`,
            );

            await page.goto(searchUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 45000,
            });

            // Scroll suave para forçar o carregamento/hidratação dos componentes dinamicos do Glassdoor/React
            await page.evaluate(() => window.scrollBy(0, 300));

            try {
              await page.waitForSelector(
                search.provider.selectors.waitSelector,
                { timeout: 15000 },
              );
            } catch (e) {
              // Tenta scroll adicional se o seletor não apareceu imediatamente
              await page.evaluate(() => window.scrollBy(0, 500));
              this.logger.warn(
                `Aviso: Seletor '${search.provider.selectors.waitSelector}' não apareceu a tempo para [${search.provider.name} | ${query} | ${locOption.label || 'Busca'}]`,
              );
            }

            const html = await page.content();
            return this.ParseHtml(html, search.provider);
          } catch (err) {
            this.logger.error(
              `Erro no scrape da combinação [${search.provider.name} | ${query}]:`,
              err,
            );
            return [];
          } finally {
            await page.close();
          }
        }),
      );

      for (const jobs of pageResults) {
        allJobs.push(...jobs);
      }
    } catch (error) {
      this.logger.error('Erro crítico no processo de scrape:', error);
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
      const companyName = $(element)
        .find(selectors.companyName)
        .first()
        .text()
        .trim();

      const postText = `Vaga: ${jobTitle} | Empresa: ${companyName}`;

      let postUrl = $(element).find(selectors.jobLink).attr('href') || '';

      if (postUrl && !postUrl.startsWith('http')) {
        const cleanBaseUrl = selectors.baseUrl.endsWith('/')
          ? selectors.baseUrl.slice(0, -1)
          : selectors.baseUrl;
        const cleanPostUrl = postUrl.startsWith('/') ? postUrl : `/${postUrl}`;
        postUrl = `${cleanBaseUrl}${cleanPostUrl}`;
      }

      if (jobTitle) {
        jobs.push({ text: postText, url: postUrl });
      }
    });

    return jobs;
  }
}
