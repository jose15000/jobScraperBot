export interface CvContactInfo {
  email: string;
  phone?: string;
  location?: string;
  linkedin: string;
  github: string;
  website?: string;
}

export interface CvExperienceItem {
  title: string;
  company: string;
  location: string;
  dates: string;
  description: string[];
}

export interface CvProjectItem {
  name: string;
  techStack?: string;
  link?: string;
  dates?: string;
  description: string[];
}

export interface CvEducationItem {
  institution: string;
  degree: string;
  location?: string;
  dates: string;
}

export interface CvLanguageItem {
  language: string;
  level: string;
  certification?: string;
}

export interface CvTechnologies {
  languages?: string;
  frontend?: string;
  backend?: string;
  databases?: string;
  devops?: string;
  aiAndTools?: string;
  practices?: string;
}

export interface CvSectionTitles {
  summary: string;
  experience: string;
  education: string;
  languages: string;
  projects: string;
  technologies: string;
}

export interface BaseCvData {
  name: string;
  headline?: string;
  contact: CvContactInfo;
  summary: string;
  experience: CvExperienceItem[];
  projects: CvProjectItem[];
  education: CvEducationItem[];
  languages: CvLanguageItem[];
  certifications?: string[];
  technologies: CvTechnologies;
  sectionTitles?: Partial<CvSectionTitles>;
}

/**
 * Only the mutable sections that the LLM is allowed to tailor for a target job.
 * Immutable fields (name, contact, education, languages, certifications) are preserved from BaseCvData in code.
 */
export interface CvTailoredPatchDto {
  headline?: string;
  summary: string;
  experience: CvExperienceItem[];
  projects: CvProjectItem[];
  technologies: CvTechnologies;
  sectionTitles?: Partial<CvSectionTitles>;
}

export interface TailoredCvEvaluation {
  isCredible: boolean;
  credibilityProbability: number;
  atsScore: number;
  summaryReason: string;
}

export interface CvOptimizationConfig {
  openRouterModel: string;
  baseCvPath: string;
}
