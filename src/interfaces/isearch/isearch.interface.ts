export type WorkplaceType = 'remote' | 'onsite' | 'hybrid';

export interface ILocationOption {
  provider?: "linkedin" | "glassdoor"
  label: string;
  workplaceTypes: WorkplaceType[];
  locationQuery?: string;
  providerParams?: Record<string, string>;
}

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
  buildSearchUrl: (query: string, location?: any) => string;
  isLinkedinPosts?: boolean;
  selectors: IProviderSelectors;
}

export interface Isearch {
  provider: IProviderConfig;
  searchQueries: string[];
  location?: ILocationOption[];
  sortBy?: 'relevance' | 'date';
}
