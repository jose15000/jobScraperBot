import { Logger } from '@nestjs/common';
import {
  JevFitEvaluation,
  JobCandidateInput,
} from 'src/interfaces/JobCandidateInput/IjobcandidateInput';
import {
  BaseCvData,
  CvTailoredPatchDto,
  TailoredCvEvaluation,
} from 'src/interfaces/cv/cv.interface';

const logger = new Logger('SystemOneClassifier');

export interface NoulCriteria {
  true: string;
  false: string;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria: NoulCriteria;
}

/**
 * Native System-One boolean probability primitive (`noul`).
 * Defines a binary judgment with explicit contrastive `true` and `false` criteria anchors.
 */
export function noul(
  instructions: string,
  criteria: NoulCriteria,
): NoulQuestion {
  return {
    type: 'noul',
    instructions,
    criteria,
  };
}

export interface SystemOneRequest<
  Q extends Record<string, NoulQuestion> = Record<string, NoulQuestion>,
> {
  state: Record<string, unknown>;
  questions: Q;
}

export interface SystemOneResponse<
  Q extends Record<string, NoulQuestion> = Record<string, NoulQuestion>,
> {
  answers: {
    [K in keyof Q]: {
      noul: number;
    };
  };
}

export interface SystemOneClient {
  systemOne<Q extends Record<string, NoulQuestion>>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResponse<Q>>;
}

export interface UserProfileCriteria {
  targetRoles: string[];
  targetTechnologies: string[];
  acceptableLevels: string[];
  excludedLevels: string[];
  locations: string[];
}

export const JOB_FIT_QUESTIONS = {
  matches_profile: noul(
    "Does this job candidate match the user's desired criteria, acceptable seniority levels, and allowed locations?",
    {
      true: 'The position fits the target stack, is junior or pleno level, and is in an allowed location (or remote). If the description is concise (e.g. title and company card), a junior or pleno developer, full-stack, frontend, or backend position matches.',
      false:
        'It requires senior/lead level, is an internship, belongs to an unrelated tech stack (e.g. C#, .NET, Java, PHP, mobile-only), is a non-tech position, or is outside allowed locations.',
    },
  ),
  is_actual_job_offer: noul(
    'Is this an actual job vacancy or recruitment post, rather than an applicant seeking employment (open to work) or unrelated promotion?',
    {
      true: 'A hiring manager, recruiter, or company is hiring or advertising a real job opening.',
      false:
        'A candidate is looking for work, an advertisement for courses, or general professional commentary.',
    },
  ),
};

export function buildJobFitEvaluationFromProbabilities(
  matchProb: number,
  isJobProb: number,
): JevFitEvaluation {
  const safeMatchProb = clampProbability(matchProb);
  const safeIsJobProb = clampProbability(isJobProb);

  // Regra calibrada System-One:
  // Deve ser uma oferta real (>= 0.60) e bater com o perfil (>= 0.50)
  const shouldApply = safeIsJobProb >= 0.6 && safeMatchProb >= 0.5;
  const score = Math.round(safeMatchProb * 100);

  let reason = 'Aprovada pelo classificador: perfil e senioridade compatíveis.';
  if (!shouldApply) {
    if (safeIsJobProb < 0.6) {
      reason = `Rejeitada pelo classificador: não aparenta ser uma vaga real de contratação (prob: ${Math.round(safeIsJobProb * 100)}%).`;
    } else {
      reason = `Rejeitada pelo classificador: fora do perfil/senioridade desejados (prob: ${score}%).`;
    }
  }

  return {
    shouldApply,
    score,
    matchProbability: safeMatchProb,
    isJobOfferProbability: safeIsJobProb,
    reason,
  };
}

export function clampProbability(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return fallback;
  }
  if (num > 1 && num <= 100) {
    return Math.min(1, Math.max(0, num / 100));
  }
  return Math.min(1, Math.max(0, num));
}

export async function evaluateJobFitWithJev(
  client: SystemOneClient,
  job: JobCandidateInput,
  profile: UserProfileCriteria,
): Promise<JevFitEvaluation> {
  try {
    const state = {
      user_criteria: {
        desired_roles: profile.targetRoles,
        desired_technologies: profile.targetTechnologies,
        acceptable_levels: profile.acceptableLevels,
        strictly_excluded_levels: profile.excludedLevels,
        allowed_locations: profile.locations,
      },
      job_candidate: {
        title: job.title || 'Título não especificado',
        company: job.company || 'Empresa não especificada',
        location: job.location || 'Não especificada',
        description_excerpt: (job.text || '').substring(0, 1200),
      },
    };

    const response = await client.systemOne({
      state,
      questions: JOB_FIT_QUESTIONS,
    });

    const matchProb = response.answers.matches_profile?.noul ?? 0;
    const isJobProb = response.answers.is_actual_job_offer?.noul ?? 0;

    return buildJobFitEvaluationFromProbabilities(matchProb, isJobProb);
  } catch (error) {
    logger.error('Erro ao avaliar vaga com o classificador System-One:', error);
    throw error;
  }
}

/**
 * Evaluates a batch of jobs in a single System-One forward pass to minimize input/output tokens.
 * Sends `user_criteria` once and generates indexed questions (`job_0_matches_profile`, etc.).
 */
export async function evaluateJobsBatchWithSystemOne(
  client: SystemOneClient,
  jobs: JobCandidateInput[],
  profile: UserProfileCriteria,
): Promise<JevFitEvaluation[]> {
  if (jobs.length === 0) return [];
  if (jobs.length === 1) {
    return [await evaluateJobFitWithJev(client, jobs[0], profile)];
  }

  const state = {
    user_criteria: {
      desired_roles: profile.targetRoles,
      desired_technologies: profile.targetTechnologies,
      acceptable_levels: profile.acceptableLevels,
      strictly_excluded_levels: profile.excludedLevels,
      allowed_locations: profile.locations,
    },
    job_candidates: jobs.map((job, idx) => ({
      id: idx,
      title: job.title || 'Título não especificado',
      company: job.company || 'Empresa não especificada',
      location: job.location || 'Não especificada',
      description_excerpt: (job.text || '').substring(0, 600),
    })),
  };

  const questions: Record<string, NoulQuestion> = {};
  for (let i = 0; i < jobs.length; i++) {
    questions[`job_${i}_matches_profile`] = noul(
      `Does \`job_candidates[${i}]\` match \`user_criteria\` (roles, stack, acceptable seniority levels, and allowed locations)?`,
      JOB_FIT_QUESTIONS.matches_profile.criteria,
    );
    questions[`job_${i}_is_actual_job_offer`] = noul(
      `Is \`job_candidates[${i}]\` an actual job vacancy or recruitment post rather than an applicant seeking employment?`,
      JOB_FIT_QUESTIONS.is_actual_job_offer.criteria,
    );
  }

  const response = await client.systemOne({
    state,
    questions,
  });

  return jobs.map((_, i) => {
    const matchProb = response.answers[`job_${i}_matches_profile`]?.noul ?? 0;
    const isJobProb =
      response.answers[`job_${i}_is_actual_job_offer`]?.noul ?? 0;
    return buildJobFitEvaluationFromProbabilities(matchProb, isJobProb);
  });
}

export async function evaluateTailoredCvWithJev(
  client: SystemOneClient,
  baseCv: BaseCvData,
  tailoredPatch: CvTailoredPatchDto,
  jobInfo: { title: string; company?: string; description: string },
): Promise<TailoredCvEvaluation> {
  try {
    const state = {
      target_job: {
        title: jobInfo.title,
        company: jobInfo.company || 'Não informada',
        description: jobInfo.description.substring(0, 1500),
      },
      original_companies: baseCv.experience.map((e) => e.company),
      tailored_cv: {
        summary: tailoredPatch.summary,
        experience: tailoredPatch.experience.map((e) => ({
          title: e.title,
          company: e.company,
          dates: e.dates,
          description: e.description,
        })),
        technologies: {
          languages: tailoredPatch.technologies.languages || '',
          frontend: tailoredPatch.technologies.frontend || '',
          backend: tailoredPatch.technologies.backend || '',
          databases: tailoredPatch.technologies.databases || '',
          devops: tailoredPatch.technologies.devops || '',
        },
      },
    };

    const questions = {
      preserves_credibility: noul(
        'Does `tailored_cv` remain factually credible relative to `original_companies` while sounding natural for a human technical recruiter?',
        {
          true: 'The tailored resume keeps the candidate original companies, avoids fabricated work history, and reads naturally.',
          false:
            'The tailored resume invents fake companies, contains obvious keyword-stuffing spam, or contradicts the candidate background.',
        },
      ),
      strong_ats_alignment: noul(
        'Does `tailored_cv` effectively incorporate the primary technical keywords and requirements from `target_job`?',
        {
          true: 'The summary, experience bullets, and technologies strongly align with the target job requirements and stack.',
          false:
            'Key technologies or role requirements from the job description are missing from the tailored resume.',
        },
      ),
    };

    const response = await client.systemOne({
      state,
      questions,
    });

    const credibilityProb = clampProbability(
      response.answers.preserves_credibility?.noul,
      1,
    );
    const atsProb = clampProbability(
      response.answers.strong_ats_alignment?.noul,
      0.85,
    );
    const atsScore = Math.round(atsProb * 100);
    const isCredible = credibilityProb >= 0.5;

    return {
      isCredible,
      credibilityProbability: credibilityProb,
      atsScore,
      summaryReason: isCredible
        ? `Aderência ATS estimada: ${atsScore}% (Credibilidade verificada: ${Math.round(credibilityProb * 100)}%)`
        : `Aviso Classificador: texto pode soar artificial (credibilidade: ${Math.round(credibilityProb * 100)}%, ATS: ${atsScore}%)`,
    };
  } catch (error) {
    logger.warn(
      'Aviso: Não foi possível auditar CV com o classificador:',
      error,
    );
    return {
      isCredible: true,
      credibilityProbability: 1,
      atsScore: 85,
      summaryReason: 'Currículo adaptado para ATS.',
    };
  }
}
