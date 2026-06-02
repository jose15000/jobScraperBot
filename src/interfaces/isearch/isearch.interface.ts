
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

    buildSearchUrl: (query: string) => string;

    isLinkedinPosts?: boolean

    selectors: IProviderSelectors;
}

export interface Isearch {
    provider: IProviderConfig;
    searchQueries: string[];
    sortBy?: "relevance" | "date";
}
