import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import {
  evaluateJobFitWithJev,
  DEFAULT_USER_PROFILE,
  UserProfileCriteria,
} from '../../utils/jev';
import { JobCandidateInput } from 'src/interfaces/JobCandidateInput/IjobcandidateInput';

export interface JobEvaluationResult {
  shouldApply: boolean;
  score: number;
  reason: string;
}

@Injectable()
export class JevService implements OnModuleInit {
  private readonly logger = new Logger(JevService.name);
  private client: TypeSafeClient | null = null;
  private isAvailable: boolean = false;

  onModuleInit() {
    const apiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
        this.client = new TypeSafeClient({ apiKey });
        this.isAvailable = true;
        this.logger.log('✅ TypeSafe Jev inicializado com sucesso.');
    }


  async evaluateJob(
    job: JobCandidateInput,
    profile: UserProfileCriteria = DEFAULT_USER_PROFILE,
  ): Promise<JobEvaluationResult> {
    if (!this.isAvailable || !this.client) {
      this.logger.error('TypeSafeClient não está inicializado para avaliar a vaga.');
      return {
        shouldApply: false,
        score: 0,
        reason: 'TypeSafe Jev não configurado (chave ausente).',
      };
    }

    try {
      const evaluation = await evaluateJobFitWithJev(this.client, job, profile);

      return {
        shouldApply: evaluation.shouldApply,
        score: evaluation.score,
        reason: evaluation.reason, 
      };
    } catch (error: unknown) {
      this.logger.error(`Erro ao avaliar vaga com o Jev: ${error}`, error);
      return {
        shouldApply: false,
        score: 0,
        reason: `Erro na avaliação com o Jev: ${error}`,
      };
    }
  }
}
