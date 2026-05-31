export interface Isearch {
    provider: string | string[];
    searchQueries: string[];
    sortBy?: "relevance" | "date";
}

