import {
  clampProbability,
  NoulQuestion,
  SystemOneClient,
  SystemOneRequest,
  SystemOneResponse,
} from '../../utils/jev';

export type ClassifierProviderType =
  | 'auto'
  | 'openrouter'
  | 'groq'
  | 'gemini'
  | 'ollama'
  | 'openai-compatible'
  | 'systemone'
  | 'jev'
  | 'kev'
  | 'laya';

export interface ClassifierProviderConfig {
  provider: ClassifierProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const SYSTEM_ONE_CLASSIFIER_PROMPT = [
  'You are a non-conversational System-One NLI probability classifier.',
  'Evaluate `state` against each question in `questions` using its `true` and `false` criteria anchors.',
  'Respond ONLY with a flat JSON object mapping each exact question key to a calibrated probability float between 0.00 and 1.00.',
  'Never output explanations, prose, or markdown.',
].join(' ');

/**
 * Compresses repeated criteria rubrics (e.g. across batch job evaluations)
 * so criteria anchors are transmitted only once per forward pass, saving ~80% input tokens.
 */
export function buildCompactClassifierPayload<
  Q extends Record<string, NoulQuestion>,
>(request: SystemOneRequest<Q>): string {
  const rubricMap = new Map<string, string>();
  const rubrics: Record<string, { true: string; false: string }> = {};
  const compactQuestions: Record<
    string,
    { q: string; rubric: string }
  > = {};

  let rubricIdx = 0;
  for (const [key, q] of Object.entries(request.questions)) {
    const signature = `${q.criteria.true}||${q.criteria.false}`;
    let rubricId = rubricMap.get(signature);
    if (!rubricId) {
      rubricId = `R${rubricIdx++}`;
      rubricMap.set(signature, rubricId);
      rubrics[rubricId] = {
        true: q.criteria.true,
        false: q.criteria.false,
      };
    }
    compactQuestions[key] = {
      q: q.instructions,
      rubric: rubricId,
    };
  }

  return JSON.stringify({
    state: request.state,
    rubrics,
    questions: compactQuestions,
  });
}

/**
 * Parses a flat or nested JSON response from an LLM or System-One endpoint into calibrated `noul` answers.
 */
export function parseSystemOneJsonOutput<
  Q extends Record<string, NoulQuestion>,
>(rawText: string, questions: Q): SystemOneResponse<Q> {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      `Classificador retornou resposta sem JSON válido: ${rawText.substring(0, 160)}`,
    );
  }

  const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<
    string,
    unknown
  >;

  const sourceMap =
    parsed.answers && typeof parsed.answers === 'object'
      ? (parsed.answers as Record<string, unknown>)
      : parsed;

  const answers = {} as SystemOneResponse<Q>['answers'];
  for (const key of Object.keys(questions) as Array<keyof Q>) {
    const rawVal = sourceMap[key as string];
    let prob = 0;
    if (typeof rawVal === 'number' || typeof rawVal === 'string') {
      prob = clampProbability(rawVal, 0);
    } else if (
      rawVal &&
      typeof rawVal === 'object' &&
      'noul' in (rawVal as Record<string, unknown>)
    ) {
      prob = clampProbability((rawVal as Record<string, unknown>).noul, 0);
    }
    answers[key] = { noul: prob };
  }

  return { answers };
}

/**
 * OpenAI-Compatible System-One Classifier Client (supports OpenRouter, Groq, Ollama, vLLM, etc.).
 * Enforces `temperature: 0`, JSON mode, and tight `max_tokens` budget so the LLM acts strictly as a classifier.
 */
export class OpenAiCompatibleClassifierClient implements SystemOneClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      model: string;
      providerName: string;
      extraHeaders?: Record<string, string>;
    },
  ) {}

  async systemOne<Q extends Record<string, NoulQuestion>>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResponse<Q>> {
    const questionCount = Object.keys(request.questions).length;
    const maxTokens = Math.min(1024, Math.max(80, questionCount * 28));
    const userPayload = buildCompactClassifierPayload(request);

    const response = await fetch(this.options.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.options.extraHeaders || {}),
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        top_p: 1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_ONE_CLASSIFIER_PROMPT },
          { role: 'user', content: userPayload },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `[${this.options.providerName}] HTTP ${response.status}: ${errBody.substring(0, 250)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `[${this.options.providerName}] Resposta vazia do modelo ${this.options.model}.`,
      );
    }

    return parseSystemOneJsonOutput(content, request.questions);
  }
}

/**
 * Google Gemini System-One Classifier Client (Google AI Studio Free Tier).
 * Uses native `responseMimeType: 'application/json'` and `temperature: 0`.
 */
export class GeminiClassifierClient implements SystemOneClient {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
    },
  ) {}

  async systemOne<Q extends Record<string, NoulQuestion>>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResponse<Q>> {
    const questionCount = Object.keys(request.questions).length;
    const maxOutputTokens = Math.min(1024, Math.max(80, questionCount * 28));
    const userPayload = buildCompactClassifierPayload(request);

    const base =
      this.options.baseUrl ||
      'https://generativelanguage.googleapis.com/v1beta/models';
    const url = `${base.replace(/\/$/, '')}/${this.options.model}:generateContent?key=${this.options.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_ONE_CLASSIFIER_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPayload }],
          },
        ],
        generationConfig: {
          temperature: 0,
          topP: 1,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `[Gemini] HTTP ${response.status}: ${errBody.substring(0, 250)}`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error(
        `[Gemini] Resposta vazia do modelo ${this.options.model}.`,
      );
    }

    return parseSystemOneJsonOutput(content, request.questions);
  }
}

/**
 * Native HTTP client for the `/v1/systemone` wire protocol (compatible with Kev, Laya, and TypeSafe Jev)
 * without requiring `@typesafe-ai/sdk`.
 */
export class NativeSystemOneHttpClient implements SystemOneClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey?: string;
      providerName: string;
    },
  ) {}

  async systemOne<Q extends Record<string, NoulQuestion>>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResponse<Q>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
      headers['x-api-key'] = this.options.apiKey;
    }

    const endpoint = this.options.baseUrl.endsWith('/v1/systemone')
      ? this.options.baseUrl
      : `${this.options.baseUrl.replace(/\/$/, '')}/v1/systemone`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state: request.state,
        questions: request.questions,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `[${this.options.providerName}] HTTP ${response.status}: ${errBody.substring(0, 250)}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return parseSystemOneJsonOutput(JSON.stringify(data), request.questions);
  }
}
