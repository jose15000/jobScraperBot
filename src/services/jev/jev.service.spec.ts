import { JevService } from './jev.service';
import {
  buildCompactClassifierPayload,
  parseSystemOneJsonOutput,
} from './classifier-providers';
import { JOB_FIT_QUESTIONS, noul, UserProfileCriteria } from '../../utils/jev';

describe('System-One Multi-Provider Classifier (JevService)', () => {
  const sampleProfile: UserProfileCriteria = {
    targetRoles: ['Desenvolvedor Full Stack Pleno'],
    targetTechnologies: ['TypeScript', 'React', 'Node.js', 'NestJS'],
    acceptableLevels: ['Júnior', 'Pleno'],
    excludedLevels: ['Sênior', 'Estágio'],
    locations: ['Remoto'],
  };

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CLASSIFIER_PROVIDER;
    delete process.env.CLASSIFIER_API_KEY;
    delete process.env.CLASSIFIER_MODEL;
    delete process.env.CLASSIFIER_BASE_URL;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPEN_ROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.JEV_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('buildCompactClassifierPayload & parseSystemOneJsonOutput', () => {
    it('deduplicates identical criteria rubrics across batch questions to save input tokens', () => {
      const payloadStr = buildCompactClassifierPayload({
        state: { candidates: [{ id: 0 }, { id: 1 }] },
        questions: {
          job_0_matches_profile: noul(
            'Match job 0?',
            JOB_FIT_QUESTIONS.matches_profile.criteria,
          ),
          job_1_matches_profile: noul(
            'Match job 1?',
            JOB_FIT_QUESTIONS.matches_profile.criteria,
          ),
        },
      });

      const parsed = JSON.parse(payloadStr);
      expect(Object.keys(parsed.rubrics)).toEqual(['R0']);
      expect(parsed.questions.job_0_matches_profile.rubric).toBe('R0');
      expect(parsed.questions.job_1_matches_profile.rubric).toBe('R0');
    });

    it('parses both flat probability maps and nested System-One answer objects', () => {
      const flatParsed = parseSystemOneJsonOutput(
        '{"matches_profile": 0.88, "is_actual_job_offer": 0.96}',
        JOB_FIT_QUESTIONS,
      );
      expect(flatParsed.answers.matches_profile.noul).toBe(0.88);
      expect(flatParsed.answers.is_actual_job_offer.noul).toBe(0.96);

      const nestedParsed = parseSystemOneJsonOutput(
        '{"answers": {"matches_profile": {"noul": 0.72}, "is_actual_job_offer": {"noul": 0.91}}}',
        JOB_FIT_QUESTIONS,
      );
      expect(nestedParsed.answers.matches_profile.noul).toBe(0.72);
      expect(nestedParsed.answers.is_actual_job_offer.noul).toBe(0.91);
    });
  });

  describe('Provider Selection & Auto-Detection', () => {
    it('auto-detects OpenRouter when OPEN_ROUTER_API_KEY is present', () => {
      process.env.OPEN_ROUTER_API_KEY = 'sk-or-test';
      const service = new JevService();
      service.onModuleInit();
      expect(service.getActiveProviderName()).toContain('openrouter');
    });

    it('prioritizes explicit CLASSIFIER_PROVIDER selection (groq, gemini, ollama, kev, laya)', () => {
      process.env.CLASSIFIER_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'gsk-test';
      const groqService = new JevService();
      groqService.onModuleInit();
      expect(groqService.getActiveProviderName()).toContain('groq');

      process.env.CLASSIFIER_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'ai-studio-test';
      const geminiService = new JevService();
      geminiService.onModuleInit();
      expect(geminiService.getActiveProviderName()).toContain('gemini');

      process.env.CLASSIFIER_PROVIDER = 'laya';
      const layaService = new JevService();
      layaService.onModuleInit();
      expect(layaService.getActiveProviderName()).toContain('laya');
    });
  });

  describe('Job & Batch Evaluation', () => {
    it('evaluates single and batch jobs using the System-One client contract', async () => {
      const service = new JevService();
      const mockSystemOne = jest.fn().mockImplementation(async (req) => {
        const answers: Record<string, { noul: number }> = {};
        for (const key of Object.keys(req.questions)) {
          if (key.includes('job_0') || key === 'matches_profile') {
            answers[key] = { noul: 0.85 };
          } else if (key.includes('is_actual_job_offer')) {
            answers[key] = { noul: 0.95 };
          } else {
            answers[key] = { noul: 0.2 };
          }
        }
        return { answers };
      });

      service.setClientForTesting({ systemOne: mockSystemOne }, 'mock-provider');

      const batchResults = await service.evaluateJobsBatch(
        [
          {
            title: 'Desenvolvedor Full Stack Pleno (Node/React)',
            company: 'Acme Tech',
            text: 'Contratamos dev pleno TypeScript, React e NestJS remoto.',
          },
          {
            title: 'Especialista Cobol Sênior',
            company: 'Legacy Corp',
            text: 'Vaga sênior Cobol mainframe presencial.',
          },
        ],
        sampleProfile,
      );

      expect(mockSystemOne).toHaveBeenCalledTimes(1);
      expect(batchResults).toHaveLength(2);
      expect(batchResults[0].shouldApply).toBe(true);
      expect(batchResults[0].score).toBe(85);
      expect(batchResults[1].shouldApply).toBe(false);
      expect(batchResults[1].score).toBe(20);
    });
  });
});
