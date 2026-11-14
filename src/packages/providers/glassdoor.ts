import {
  ILocationOption,
  IProviderConfig,
} from '../../interfaces/isearch/isearch.interface';

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
    container:
      '[data-test="jobListing"], article, [class*="JobCard"], li[class*="JobsList_jobListItem"]',
    jobTitle:
      '[data-test="job-title"], a[class*="JobTitle"], [class*="job-title"]',
    companyName:
      '[class*="EmployerProfile"], [class*="EmployerName"], [data-test="employer-name"]',
    jobLink:
      'a[data-test="job-title"], a[class*="JobTitle"], a[href*="/job-listing/"]',
    waitSelector:
      '[data-test="jobListing"], article, [class*="JobsList"], [class*="JobCard"], a[href*="/job-listing/"]',
    baseUrl: 'https://www.glassdoor.com.br',
  },
};

export function createGlassdoorProvider(
  overrides?: Partial<IProviderConfig>,
): IProviderConfig {
  return {
    ...glassdoorProvider,
    ...overrides,
    selectors: {
      ...glassdoorProvider.selectors,
      ...(overrides?.selectors || {}),
    },
  };
}
