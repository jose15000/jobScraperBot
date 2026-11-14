import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext } from 'playwright';
import {
  ILocationOption,
  IProviderConfig,
  Isearch,
} from 'src/interfaces/isearch/isearch.interface';
import * as cheerio from 'cheerio';
import { ScrapedPost } from 'src/interfaces/ScrapedPost/iscrapedpost.interface';

interface ScrapeTask {
  provider: IProviderConfig;
  query: string;
  locOption: ILocationOption;
}

@Injectable()
export class PlaywrightService {
  private readonly logger = new Logger(PlaywrightService.name);
  private readonly defaultConcurrency = Number(
    process.env.SCRAPER_CONCURRENCY || 3,
  );

  async startBrowser(): Promise<{
    browser: Browser;
    context: BrowserContext;
  }> {
    const browser: Browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
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

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    return { browser, context };
  }

  /**
   * Checks whether a location option is applicable to a given provider:
   * - Respects `locOption.provider` when specified (e.g. 'glassdoor' or 'linkedin')
   * - Respects `provider.supportsLocation(locOption)` when defined (e.g. Remotar remote-only)
   */
  isLocationSupported(
    provider: IProviderConfig,
    locOption: ILocationOption,
  ): boolean {
    if (locOption.provider && locOption.provider !== provider.name) {
      return false;
    }
    if (provider.supportsLocation && !provider.supportsLocation(locOption)) {
      return false;
    }
    return true;
  }

  /**
   * Scrapes multiple providers reusing a SINGLE Chromium browser instance
   * and a bounded tab concurrency pool to minimize RAM and CPU spikes on the VPS.
   */
  async scrapeProviders(
    providers: IProviderConfig[],
    queries: string[],
    locations: ILocationOption[],
    concurrency = this.defaultConcurrency,
  ): Promise<ScrapedPost[]> {
    const tasks: ScrapeTask[] = [];
    for (const provider of providers) {
      for (const query of queries) {
        for (const locOption of locations) {
          if (this.isLocationSupported(provider, locOption)) {
            tasks.push({ provider, query, locOption });
          }
        }
      }
    }

    if (tasks.length === 0) {
      return [];
    }

    const { browser, context } = await this.startBrowser();
    const allJobs: ScrapedPost[] = [];

    try {
      let taskIndex = 0;
      const workerCount = Math.min(Math.max(1, concurrency), tasks.length);

      const workers = Array.from({ length: workerCount }, async () => {
        while (taskIndex < tasks.length) {
          const currentIdx = taskIndex++;
          const task = tasks[currentIdx];
          if (!task) break;

          const jobs = await this.scrapeSingleTask(context, task);
          allJobs.push(...jobs);
        }
      });

      await Promise.all(workers);
    } catch (error) {
      this.logger.error('Erro crítico no processo de scrape:', error);
      throw error;
    } finally {
      await browser.close();
    }

    return allJobs;
  }

  async scrape(search: Isearch): Promise<ScrapedPost[]> {
    return this.scrapeProviders(
      [search.provider],
      search.searchQueries,
      search.location || [],
    );
  }

  private async scrapeSingleTask(
    context: BrowserContext,
    { provider, query, locOption }: ScrapeTask,
  ): Promise<ScrapedPost[]> {
    const page = await context.newPage();
    try {
      const searchUrl = provider.buildSearchUrl(query, locOption);
      this.logger.log(
        `[${provider.name}] (${locOption.label || 'Busca'}) Navegando para: ${searchUrl}`,
      );

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      await page.evaluate(() => window.scrollBy(0, 300));

      try {
        await page.waitForSelector(provider.selectors.waitSelector, {
          timeout: 15000,
        });
      } catch {
        await page.evaluate(() => window.scrollBy(0, 500));
        this.logger.warn(
          `Aviso: Seletor '${provider.selectors.waitSelector}' não apareceu a tempo para [${provider.name} | ${query} | ${locOption.label || 'Busca'}]`,
        );
      }

      const html = await page.content();
      return this.parseHtml(html, provider, locOption.label);
    } catch (err) {
      this.logger.error(
        `Erro no scrape da combinação [${provider.name} | ${query}]:`,
        err,
      );
      return [];
    } finally {
      await page.close();
    }
  }

  parseHtml(
    html: string,
    provider: IProviderConfig,
    locationLabel?: string,
  ): ScrapedPost[] {
    const $ = cheerio.load(html);
    const jobs: ScrapedPost[] = [];
    const { selectors } = provider;

    $(selectors.container).each((_, element) => {
      const jobTitle = $(element).find(selectors.jobTitle).text().trim();
      if (!jobTitle) return;

      const rawCompany = $(element)
        .find(selectors.companyName)
        .first()
        .text()
        .trim();
      const cleanCompany = rawCompany.replace(/\d+([.,]\d+)?\s*$/, '').trim();

      const postText = cleanCompany
        ? `Vaga: ${jobTitle} | Empresa: ${cleanCompany}`
        : `Vaga: ${jobTitle}`;

      let postUrl = $(element).find(selectors.jobLink).attr('href') || '';
      if (postUrl && !postUrl.startsWith('http')) {
        const cleanBaseUrl = selectors.baseUrl.replace(/\/$/, '');
        const cleanPostUrl = postUrl.startsWith('/') ? postUrl : `/${postUrl}`;
        postUrl = `${cleanBaseUrl}${cleanPostUrl}`;
      }

      jobs.push({
        title: jobTitle,
        company: cleanCompany || undefined,
        location: locationLabel,
        text: postText,
        url: postUrl,
      });
    });

    return jobs;
  }
}
