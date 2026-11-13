import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { TypstTemplateService } from './typst-template.service';
import { TypstCompilerService } from './typst-compiler.service';
import { CvLlmService } from './cv-llm.service';
import { CvOptimizationService } from './cv-optimization.service';
import { BaseCvData } from '../../interfaces/cv/cv.interface';
import { JobConfigService } from '../../config/job-config.service';

describe('CV Optimization Pipeline Services', () => {
  let templateService: TypstTemplateService;
  let compilerService: TypstCompilerService;
  let sampleBaseCv: BaseCvData;

  beforeAll(() => {
    templateService = new TypstTemplateService();
    compilerService = new TypstCompilerService();
    const cvYamlPath = path.resolve(process.cwd(), 'cv.base.yaml');
    sampleBaseCv = YAML.parse(
      fs.readFileSync(cvYamlPath, 'utf8'),
    ) as BaseCvData;
  });

  describe('TypstTemplateService', () => {
    it('should escape special Typst markup characters safely', () => {
      const escaped = templateService.escapeTypst(
        'C# & Node.js *100%* _fast_ $100 @user [tag] #hash',
      );
      expect(escaped).toContain('C\\#');
      expect(escaped).toContain('\\*100%\\*');
      expect(escaped).toContain('\\_fast\\_');
      expect(escaped).toContain('\\$100');
      expect(escaped).toContain('\\[tag\\]');
    });

    it('should preserve immutable fields when merging base CV with LLM patch', () => {
      const merged = templateService.mergeBaseWithPatch(sampleBaseCv, {
        summary: 'Resumo adaptado para vaga Backend Node.js e NestJS.',
        technologies: {
          backend: 'NestJS, Node.js, TypeScript, PostgreSQL',
        },
      });

      expect(merged.name).toBe(sampleBaseCv.name);
      expect(merged.contact.email).toBe(sampleBaseCv.contact.email);
      expect(merged.education).toEqual(sampleBaseCv.education);
      expect(merged.summary).toBe(
        'Resumo adaptado para vaga Backend Node.js e NestJS.',
      );
      expect(merged.technologies.backend).toBe(
        'NestJS, Node.js, TypeScript, PostgreSQL',
      );
    });

    it('should compile cv.base.yaml into a valid PDF buffer using Typst', async () => {
      const typstDoc = templateService.renderTypstDocument(sampleBaseCv, {
        title: 'Desenvolvedor Full Stack Pleno',
        company: 'Acme Tech',
      });

      expect(typstDoc).toContain('José Henrique');
      expect(typstDoc).toContain('GoWork Digital');

      const pdfBuffer = await compilerService.compileToPdfBuffer(typstDoc);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(2000);
      expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });

  describe('CvLlmService', () => {
    it('should strip <think> blocks and markdown fences and preserve original company/dates', () => {
      const mockConfigService = {
        getCvOptimizationConfig: jest.fn().mockReturnValue({
          openRouterModel: 'openrouter/free',
          baseCvPath: './cv.base.yaml',
        }),
      } as unknown as JobConfigService;

      const llmService = new CvLlmService(mockConfigService);

      const rawOutput = `<think>Reasoning about ATS keywords...</think>
\`\`\`json
{
  "summary": "Full Stack Developer specialized in React, Next.js, and NestJS.",
  "experience": [
    {
      "title": "Full Stack Software Engineer",
      "company": "Hallucinated Corp",
      "location": "Mars",
      "dates": "2099",
      "description": [
        "Built scalable REST APIs with NestJS, TypeScript, and PostgreSQL."
      ]
    }
  ],
  "projects": [],
  "technologies": {
    "backend": "NestJS, Node.js, TypeScript"
  },
  "sectionTitles": {
    "summary": "Professional Summary"
  }
}
\`\`\``;

      const patch = llmService.parseTailoredPatchJson(rawOutput, sampleBaseCv);

      expect(patch.summary).toBe(
        'Full Stack Developer specialized in React, Next.js, and NestJS.',
      );
      // Must preserve original company, location, and dates from baseCv
      expect(patch.experience[0].company).toBe(
        sampleBaseCv.experience[0].company,
      );
      expect(patch.experience[0].dates).toBe(sampleBaseCv.experience[0].dates);
      expect(patch.experience[0].title).toBe('Full Stack Software Engineer');
      expect(patch.sectionTitles?.summary).toBe('Professional Summary');
    });
  });

  describe('CvOptimizationService', () => {
    it('should parse /cv commands for job ID and custom input', () => {
      const cvOptService = new CvOptimizationService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        templateService,
        compilerService,
        {} as any,
      );

      expect(cvOptService.parseCvCommand('/cv 42')).toEqual({
        type: 'jobId',
        jobId: 42,
      });
      expect(cvOptService.parseCvCommand('/cv #15')).toEqual({
        type: 'jobId',
        jobId: 15,
      });
      expect(cvOptService.parseCvCommand('gerar cv 7')).toEqual({
        type: 'jobId',
        jobId: 7,
      });
      expect(
        cvOptService.parseCvCommand(
          '/cv Vaga Desenvolvedor React Pleno com TypeScript',
        ),
      ).toEqual({
        type: 'custom',
        input: 'Vaga Desenvolvedor React Pleno com TypeScript',
      });
      expect(cvOptService.parseCvCommand('bom dia')).toBeNull();
    });

    it('should orchestrate full optimization for a stored job ID and send PDF via BotService', async () => {
      const mockConfigService = {
        getBaseCv: jest.fn().mockReturnValue(sampleBaseCv),
      };
      const mockHistoryRepo = {
        getJobById: jest.fn().mockResolvedValue({
          id: 42,
          title: 'Desenvolvedor Full Stack Node/React',
          company: 'TechCorp',
          url: 'https://example.com/jobs/42',
          description: 'Requisitos: React, Next.js, Node.js, NestJS, Docker, PostgreSQL, testes automatizados com Jest e CI/CD.',
        }),
      };
      const mockLlmService = {
        generateTailoredCvPatch: jest.fn().mockResolvedValue({
          summary:
            'Desenvolvedor Full Stack com sólida experiência em React, Next.js, Node.js, NestJS, PostgreSQL e Docker.',
          experience: sampleBaseCv.experience,
          projects: sampleBaseCv.projects,
          technologies: sampleBaseCv.technologies,
        }),
      };
      const mockJevService = {
        evaluateTailoredCv: jest.fn().mockResolvedValue({
          isCredible: true,
          credibilityProbability: 0.95,
          atsScore: 92,
          summaryReason: 'Aderência ATS estimada: 92%',
        }),
      };
      const mockBotService = {
        sendMediaDocument: jest.fn().mockResolvedValue(undefined),
      };

      process.env.INSTANCE_NAME = 'job-bot';
      process.env.WHATSAPP_NUMBER = '5579988043018';

      const cvOptService = new CvOptimizationService(
        mockConfigService as any,
        mockHistoryRepo as any,
        mockLlmService as any,
        mockJevService as any,
        templateService,
        compilerService,
        mockBotService as any,
      );

      const res = await cvOptService.optimizeForStoredJobId(42);

      expect(res.fileName).toBe('Curriculo_Jose_Henrique_TechCorp.pdf');
      expect(res.pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(mockBotService.sendMediaDocument).toHaveBeenCalledTimes(1);
      expect(mockBotService.sendMediaDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceName: 'job-bot',
          number: '5579988043018',
          fileName: 'Curriculo_Jose_Henrique_TechCorp.pdf',
        }),
      );
    });
  });
});
