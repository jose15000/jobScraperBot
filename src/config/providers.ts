import { IProviderConfig, ILocationOption } from '../interfaces/isearch/isearch.interface';

export const glassdoorProvider: IProviderConfig = {
  name: 'glassdoor',
  buildSearchUrl: (query: string, location?: ILocationOption) => {
    const locId =
      location?.providerParams?.glassdoorLocationId ||
      location?.providerParams?.glassdoorGeoId;
    const icPart = locId ? `_IC${locId}` : '';
    const locPart = location?.locationQuery ? `${location.locationQuery}-` : '';
    const cleanQuery = encodeURIComponent(
      query.toLowerCase().replace(/\s+/g, '-'),
    );

    return `https://www.glassdoor.com.br/Vaga/${locPart}${cleanQuery}-vagas-SRCH_IL.0,15${icPart}.htm`;
  },
  selectors: {
    container: '[data-test="jobListing"], article, [class*="JobCard"], li[class*="JobsList_jobListItem"]',
    jobTitle: '[data-test="job-title"], a[class*="JobTitle"], [class*="job-title"]',
    companyName: '[class*="EmployerProfile"], [class*="EmployerName"], [data-test="employer-name"]',
    jobLink: 'a[data-test="job-title"], a[class*="JobTitle"], a[href*="/job-listing/"]',
    waitSelector: '[data-test="jobListing"], article, [class*="JobsList"], [class*="JobCard"], a[href*="/job-listing/"]',
    baseUrl: 'https://www.glassdoor.com.br',
  },
};

export const linkedinProvider: IProviderConfig = {
  name: 'linkedin',
  buildSearchUrl: (query: string, location?: ILocationOption) => {
    const locQuery = location?.locationQuery!
    const geoId = location?.providerParams?.linkedinGeoId || '106057199';
    return `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(locQuery)}&geoId=${geoId}&f_TPR=r3600&position=1&pageNum=0`;
  },
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


