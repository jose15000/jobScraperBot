import * as path from 'path';
import * as readline from 'readline';
import {
  LioApplyOptions,
  NormalizedCandidateJob,
  createLioApply,
} from '../core';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const LIOAPPLY_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'lioapply_search_jobs',
    description:
      'Scrapes job listings from selected providers (linkedin, glassdoor, remotar) and deduplicates them by normalized title and company.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional search queries override (defaults to jobs.config.yaml).',
        },
        providers: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['linkedin', 'glassdoor', 'remotar'],
          },
          description:
            'Optional list of providers to run (defaults to all enabled providers).',
        },
      },
    },
  },
  {
    name: 'lioapply_get_classification_rubric',
    description:
      'Returns the System-One { state, questions, thresholds } Noul rubric and user profile criteria so the host MCP AI agent can classify candidate jobs directly without external API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          description: 'List of candidate jobs returned by lioapply_search_jobs.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              company: { type: 'string' },
              text: { type: 'string' },
              location: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['title', 'text', 'url'],
          },
        },
      },
      required: ['candidates'],
    },
  },
  {
    name: 'lioapply_classify_jobs',
    description:
      'Evaluates candidate jobs in batch using the configured System-One Multi-Provider classifier (openrouter, groq, gemini, ollama, laya, kev, or jev).',
    inputSchema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              company: { type: 'string' },
              text: { type: 'string' },
              location: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['title', 'text', 'url'],
          },
        },
      },
      required: ['candidates'],
    },
  },
  {
    name: 'lioapply_optimize_cv',
    description:
      'Generates a tailored, ATS-optimized PDF resume from cv.base.yaml for a specific job using OpenRouter and Typst.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Target job title.',
        },
        company: {
          type: 'string',
          description: 'Target company name (optional).',
        },
        description: {
          type: 'string',
          description: 'Full job description or requirements.',
        },
        outputPath: {
          type: 'string',
          description:
            'Optional output file path for the generated PDF (defaults to ./result/<fileName>).',
        },
      },
      required: ['title', 'description'],
    },
  },
];

/**
 * `@lioapply/mcp`: Official MCP Server injecting `@lioapply/core`, `@lioapply/providers`, and `@lioapply/cv`.
 */
export function createLioApplyMcpServer(options?: LioApplyOptions) {
  const lio = createLioApply({
    ...options,
    cv: {
      outputDir: path.resolve(process.cwd(), 'result'),
      ...(options?.cv || {}),
    },
  });

  return {
    lio,

    listTools(): McpToolDefinition[] {
      return LIOAPPLY_MCP_TOOLS;
    },

    async callTool(name: string, args: Record<string, any> = {}) {
      switch (name) {
        case 'lioapply_search_jobs': {
          const result = await lio.scrapeJobs({
            queries: Array.isArray(args.queries) ? args.queries : undefined,
            providers: Array.isArray(args.providers)
              ? args.providers
              : undefined,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'lioapply_get_classification_rubric': {
          const candidates = (args.candidates || []) as NormalizedCandidateJob[];
          const rubric = lio.buildSystemOneClassificationState(candidates);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(rubric, null, 2),
              },
            ],
          };
        }

        case 'lioapply_classify_jobs': {
          const candidates = (args.candidates || []) as NormalizedCandidateJob[];
          const approvedJobs = await lio.classifyJobs(candidates);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ approvedJobs }, null, 2),
              },
            ],
          };
        }

        case 'lioapply_optimize_cv': {
          const res = await lio.cv.optimizeForJob({
            title: String(args.title || 'Desenvolvedor de Software'),
            company: args.company ? String(args.company) : undefined,
            description: String(args.description || ''),
            outputPath: args.outputPath ? String(args.outputPath) : undefined,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    fileName: res.fileName,
                    savedFilePath: res.savedFilePath,
                    pdfSizeBytes: res.pdfBuffer.length,
                    evaluation: res.evaluation,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        default:
          throw new Error(`MCP Tool desconhecida: ${name}`);
      }
    },

    async handleJsonRpcRequest(
      request: JsonRpcRequest,
    ): Promise<JsonRpcResponse | null> {
      if (request.id === undefined) {
        return null;
      }

      try {
        switch (request.method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                },
                serverInfo: {
                  name: '@lioapply/mcp',
                  version: '1.0.0',
                },
              },
            };

          case 'ping':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {},
            };

          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                tools: this.listTools(),
              },
            };

          case 'tools/call': {
            const toolName = request.params?.name;
            const toolArgs = request.params?.arguments || {};
            const toolResult = await this.callTool(toolName, toolArgs);
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: toolResult,
            };
          }

          default:
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Method not found: ${request.method}`,
              },
            };
        }
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: err?.message || String(err),
          },
        };
      }
    },

    startStdio(): void {
      const rl = readline.createInterface({
        input: process.stdin,
        terminal: false,
      });

      rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const req = JSON.parse(trimmed) as JsonRpcRequest;
          const res = await this.handleJsonRpcRequest(req);
          if (res) {
            process.stdout.write(JSON.stringify(res) + '\n');
          }
        } catch (err: any) {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: `Parse error: ${err?.message || err}`,
              },
            }) + '\n',
          );
        }
      });
    },
  };
}
