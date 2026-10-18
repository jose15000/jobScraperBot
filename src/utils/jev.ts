import { TypeSafeClient, noul } from '@typesafe-ai/sdk';
import { Logger } from '@nestjs/common';
import { JevFitEvaluation, JobCandidateInput } from 'src/interfaces/JobCandidateInput/IjobcandidateInput';

const logger = new Logger('JevHeuristics');

export interface UserProfileCriteria {
  targetRoles: string[];
  targetTechnologies: string[];
  acceptableLevels: string[];
  excludedLevels: string[];
  locations: string[];
}

export async function evaluateJobFitWithJev(
  client: TypeSafeClient,
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
        description_excerpt: (job.text || '').substring(0, 1500),
      },
    };

    const questions = {
      matches_profile: noul(
        "Does this job candidate match the user's desired criteria, acceptable seniority levels, and allowed locations?",
        {
          true: "The position fits the target stack, is junior or pleno level, and is in an allowed location (or remote). If the description is concise (e.g. title and company card), a junior or pleno developer, full-stack, frontend, or backend position matches.",
          false: "It requires senior/lead level, is an internship, belongs to an unrelated tech stack (e.g. C#, .NET, Java, PHP, mobile-only), is a non-tech position, or is outside allowed locations.",
        },
      ),
      is_actual_job_offer: noul(
        "Is this an actual job vacancy or recruitment post, rather than an applicant seeking employment (open to work) or unrelated promotion?",
        {
          true: "A hiring manager, recruiter, or company is hiring or advertising a real job opening.",
          false: "A candidate is looking for work, an advertisement for courses, or general professional commentary.",
        },
      ),
    };

    const response = await client.systemOne({
      state,
      questions,
    });

    const matchProb = response.answers.matches_profile.noul;
    const isJobProb = response.answers.is_actual_job_offer.noul;

    // Regra calibrada do Jev:
    // Deve ser uma oferta real (>= 0.60) e bater com o perfil (>= 0.50)
    const shouldApply = isJobProb >= 0.60 && matchProb >= 0.50;
    const score = Math.round(matchProb * 100);

    let reason = 'Aprovada pelo Jev: perfil e senioridade compatíveis.';
    if (!shouldApply) {
      if (isJobProb < 0.60) {
        reason = `Rejeitada pelo Jev: não aparenta ser uma vaga real de contratação (prob: ${Math.round(isJobProb * 100)}%).`;
      } else {
        reason = `Rejeitada pelo Jev: fora do perfil/senioridade desejados (prob: ${score}%).`;
      }
    }

    return {
      shouldApply,
      score,
      matchProbability: matchProb,
      isJobOfferProbability: isJobProb,
      reason,
    };
  } catch (error) {
    logger.error('Erro ao avaliar vaga com o Jev:', error);
    throw error;
  }
}

