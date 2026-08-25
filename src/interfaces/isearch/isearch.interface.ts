export interface IProviderSelectors {
  container: string;
  jobTitle: string;
  companyName: string;
  jobLink: string;
  waitSelector: string;
  baseUrl: string;
}

export interface IProviderConfig {
  name: string;

  buildSearchUrl: (query: string, location: string) => string;

  isLinkedinPosts?: boolean;

  selectors: IProviderSelectors;
}

export interface Isearch {
  provider: IProviderConfig;
  searchQueries: string[];
  location?: string[];
  sortBy?: 'relevance' | 'date';
}
