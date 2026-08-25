import { IProviderConfig } from '../interfaces/isearch/isearch.interface';

export const glassdoorProvider: IProviderConfig = {
  name: 'glassdoor',
  buildSearchUrl: (query: string) =>
    `https://www.glassdoor.com.br/Vaga/trabalho-remoto-${encodeURIComponent(query)}-vagas-SRCH_IL.0,15_IS12226_KO16,47.htm`,
  selectors: {
    container: '[data-test="jobListing"]',
    jobTitle: '[data-test="job-title"]',
    companyName: '[class*="EmployerProfile"]',
    jobLink: 'a[data-test="job-title"]',
    waitSelector: 'article, [data-test="jobListing"]',
    baseUrl: 'https://www.glassdoor.com.br',
  },
};

export const linkedinProvider: IProviderConfig = {
  name: 'linkedin',
  buildSearchUrl: (query: string) =>
    `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}location=Brazil&geoId=106057199&f_TPR=r3600&position=1&pageNum=0`,
  selectors: {
    container: 'li',
    jobTitle: 'h3.base-search-card__title',
    companyName: 'h4.base-search-card__subtitle',
    jobLink: 'a.base-card__full-link',
    waitSelector: 'li',
    baseUrl: 'https://www.linkedin.com',
  },
};
export const remotarProvider: IProviderConfig = {
  name: 'remotar',
  buildSearchUrl: (query: string) =>
    `https://remotar.com.br/search/jobs?q=${encodeURIComponent(query)}&c=13&t=4&t=17&t=21`,

  selectors: {
    container: '[class="box-content"]',
    jobTitle: 'a.job-title',
    companyName: 'a.company',
    jobLink: 'a.job-title',
    waitSelector: 'main',
    baseUrl: 'https://remotar.com.br',
  },
};


