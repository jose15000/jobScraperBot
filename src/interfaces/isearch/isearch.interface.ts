export interface Isearch {
    contentType?: string;
    maxPosts?: number;
    maxReactions?: number;
    postNestedComments?: boolean;
    postNestedReactions?: boolean;
    postedLimit?: "1h" | "24h" | "week" | "month";
    postedLimitDate?: string;
    profileScraperMode?: string;
    scrapeComments?: boolean;
    scrapeReactions?: boolean;
    searchQueries: string[];
    sortBy?: "relevance" | "date";
}

