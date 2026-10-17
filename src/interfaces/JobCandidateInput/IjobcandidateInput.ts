export interface JobCandidateInput {
  title: string;
  text: string;
  company?: string;
  location?: string;
  url?: string;
}

export interface JevFitEvaluation {
  shouldApply: boolean;
  score: number;
  matchProbability: number;
  isJobOfferProbability: number;
  reason: string;
}