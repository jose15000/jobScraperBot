import {
  ILocationOption,
  IProviderConfig,
} from '../../interfaces/isearch/isearch.interface';

export const linkedinProvider: IProviderConfig = {
  name: 'linkedin',
  buildSearchUrl: (query: string, location?: ILocationOption) => {
    const locQuery = location?.locationQuery || 'brasil';
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

export function createLinkedinProvider(
  overrides?: Partial<IProviderConfig>,
): IProviderConfig {
  return {
    ...linkedinProvider,
    ...overrides,
    selectors: {
      ...linkedinProvider.selectors,
      ...(overrides?.selectors || {}),
    },
  };
}
