import { DynamicModule, Module } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { JobConfigService } from '../../config/job-config.service';
import { JevService } from '../../services/jev/jev.service';
import { CvLlmService } from '../../services/cv/cv-llm.service';
import { TypstTemplateService } from '../../services/cv/typst-template.service';
import { TypstCompilerService } from '../../services/cv/typst-compiler.service';
import {
  CvOptimizationResult,
  CvOptimizationService,
} from '../../services/cv/cv-optimization.service';
import {
  BaseCvData,
  CvOptimizationConfig,
  CvTailoredPatchDto,
  TailoredCvEvaluation,
} from '../../interfaces/cv/cv.interface';

export interface CvEngineOptions {
  baseCvPath?: string;
  baseCv?: BaseCvData;
  openRouterApiKey?: string;
  openRouterModel?: string;
  outputDir?: string;
}

export interface StandaloneCvOptimizationResult extends CvOptimizationResult {
  savedFilePath?: string;
}

/**
 * Pure SDK Factory (`@lioapply/cv`): Creates a standalone ATS CV optimization engine
 * that can be used in any script or MCP server without requiring NestJS DI or WhatsApp/Postgres.
 */
export function createCvEngine(options?: CvEngineOptions) {
  if (options?.openRouterApiKey) {
    process.env.OPEN_ROUTER_API_KEY = options.openRouterApiKey;
  }
  if (options?.openRouterModel) {
    process.env.OPENROUTER_MODEL = options.openRouterModel;
  }
  if (options?.baseCvPath) {
    process.env.CV_BASE_PATH = options.baseCvPath;
  }

  const configService = new JobConfigService();
  try {
    configService.loadConfig();
  } catch {
    // Config YAML is optional when using CvEngine standalone
  }

  const jevService = new JevService(configService);
  jevService.initializeProvider();

  const llmService = new CvLlmService(configService);
  const templateService = new TypstTemplateService();
  const compilerService = new TypstCompilerService();

  return {
    getBaseCv(): BaseCvData {
      return options?.baseCv || configService.getBaseCv();
    },

    async optimizeForJob(jobInfo: {
      title: string;
      company?: string;
      description: string;
      outputPath?: string;
    }): Promise<StandaloneCvOptimizationResult> {
      const baseCv = this.getBaseCv();
      const patch = await llmService.generateTailoredCvPatch(baseCv, {
        title: jobInfo.title,
        company: jobInfo.company,
        description: jobInfo.description,
      });

      const evaluation = await jevService.evaluateTailoredCv(
        baseCv,
        patch,
        jobInfo,
      );

      const tailoredCv = templateService.mergeBaseWithPatch(baseCv, patch);
      const typstSource = templateService.renderTypstDocument(tailoredCv, {
        title: jobInfo.title,
        company: jobInfo.company,
      });

      const pdfBuffer = await compilerService.compileToPdfBuffer(typstSource);

      const safeName = (baseCv.name || 'Candidato')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 35);
      const safeTarget = (jobInfo.company || jobInfo.title || 'Vaga')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 35);
      const fileName = `Curriculo_${safeName}_${safeTarget}.pdf`;

      let savedFilePath: string | undefined;
      const targetOutput =
        jobInfo.outputPath ||
        (options?.outputDir
          ? path.resolve(options.outputDir, fileName)
          : undefined);

      if (targetOutput) {
        fs.mkdirSync(path.dirname(targetOutput), { recursive: true });
        fs.writeFileSync(targetOutput, pdfBuffer);
        savedFilePath = targetOutput;
      }

      return {
        pdfBuffer,
        fileName,
        evaluation,
        tailoredCv,
        savedFilePath,
      };
    },

    renderTypst(
      cvData: BaseCvData,
      targetJob?: { title?: string; company?: string },
    ): string {
      return templateService.renderTypstDocument(cvData, targetJob);
    },

    async compilePdf(typstSource: string): Promise<Buffer> {
      return compilerService.compileToPdfBuffer(typstSource);
    },
  };
}

@Module({})
export class LioApplyCvModule {
  static register(): DynamicModule {
    return {
      module: LioApplyCvModule,
      providers: [
        CvLlmService,
        TypstTemplateService,
        TypstCompilerService,
      ],
      exports: [
        CvLlmService,
        TypstTemplateService,
        TypstCompilerService,
      ],
    };
  }
}

export {
  CvOptimizationService,
  CvLlmService,
  TypstTemplateService,
  TypstCompilerService,
};

export type {
  CvOptimizationResult,
  BaseCvData,
  CvOptimizationConfig,
  CvTailoredPatchDto,
  TailoredCvEvaluation,
};
