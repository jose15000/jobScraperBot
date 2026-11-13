import { Injectable, Logger } from '@nestjs/common';
import {
  BaseCvData,
  CvTailoredPatchDto,
} from '../../interfaces/cv/cv.interface';
import {
  buildAtsCvOptimizationPrompt,
  LlmChatMessage,
} from './prompts/cv-ats.prompt';
import { JobConfigService } from '../../config/job-config.service';

@Injectable()
export class CvLlmService {
  private readonly logger = new Logger(CvLlmService.name);
  private readonly openRouterEndpoint =
    'https://openrouter.ai/api/v1/chat/completions';

  constructor(private readonly jobConfigService: JobConfigService) {}

  async generateTailoredCvPatch(
    baseCv: BaseCvData,
    jobInfo: { title: string; company?: string; description: string },
  ): Promise<CvTailoredPatchDto> {
    const apiKey =
      process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Chave OPEN_ROUTER_API_KEY (ou OPENROUTER_API_KEY) não configurada no ambiente (.env).',
      );
    }

    const { openRouterModel } =
      this.jobConfigService.getCvOptimizationConfig();
    const messages = buildAtsCvOptimizationPrompt(baseCv, jobInfo);

    this.logger.log(
      `🤖 Solicitando adaptação ATS ao OpenRouter (modelo: ${openRouterModel}) para a vaga "${jobInfo.title}"...`,
    );

    const rawText = await this.callOpenRouter(
      apiKey,
      openRouterModel,
      messages,
    );
    return this.parseTailoredPatchJson(rawText, baseCv);
  }

  private async callOpenRouter(
    apiKey: string,
    model: string,
    messages: LlmChatMessage[],
  ): Promise<string> {
    const response = await fetch(this.openRouterEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jose15000/jobScraperBot',
        'X-Title': 'JobSearchBot CV Optimizer',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Erro na API do OpenRouter (${response.status}): ${errBody}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter retornou resposta vazia.');
    }

    return typeof content === 'string' ? content : JSON.stringify(content);
  }

  /**
   * Strips <think> blocks and markdown code fences, then parses and validates the JSON patch.
   */
  parseTailoredPatchJson(
    rawText: string,
    fallbackBase: BaseCvData,
  ): CvTailoredPatchDto {
    const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const firstBrace = withoutThink.indexOf('{');
    const lastBrace = withoutThink.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error(
        'A resposta do modelo de IA não contém um objeto JSON válido.',
      );
    }

    const jsonCandidate = withoutThink.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonCandidate) as Partial<CvTailoredPatchDto>;

    return {
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
          ? parsed.summary.trim()
          : fallbackBase.summary,
      experience:
        Array.isArray(parsed.experience) && parsed.experience.length > 0
          ? parsed.experience.map((exp, idx) => {
              const orig = fallbackBase.experience[idx];
              return {
                title: exp.title || orig?.title || 'Desenvolvedor',
                company: orig?.company || exp.company || '',
                location: orig?.location || exp.location || '',
                dates: orig?.dates || exp.dates || '',
                description: Array.isArray(exp.description)
                  ? exp.description.map((d) => String(d).trim()).filter(Boolean)
                  : orig?.description || [],
              };
            })
          : fallbackBase.experience,
      projects:
        Array.isArray(parsed.projects) && parsed.projects.length > 0
          ? parsed.projects.map((proj, idx) => {
              const orig = fallbackBase.projects[idx];
              return {
                name: orig?.name || proj.name || 'Projeto',
                link: orig?.link || proj.link,
                dates: orig?.dates || proj.dates,
                description: Array.isArray(proj.description)
                  ? proj.description
                      .map((d) => String(d).trim())
                      .filter(Boolean)
                  : orig?.description || [],
              };
            })
          : fallbackBase.projects,
      technologies:
        parsed.technologies && typeof parsed.technologies === 'object'
          ? {
              ...fallbackBase.technologies,
              ...parsed.technologies,
            }
          : fallbackBase.technologies,
      sectionTitles:
        parsed.sectionTitles && typeof parsed.sectionTitles === 'object'
          ? parsed.sectionTitles
          : fallbackBase.sectionTitles,
    };
  }
}
