import { Injectable } from '@nestjs/common';

export interface JobIdentity {
  title: string;
  company?: string;
}

/**
 * Normaliza um texto para comparação:
 * - Converte para minúsculas
 * - Remove acentos e diacríticos
 * - Remove caracteres especiais e pontuações
 * - Colapsa espaços múltiplos e faz trim
 */
export function normalizeJobText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera uma chave única normalizada baseada no título e na empresa da vaga.
 * Exemplo: "desenvolvedor front end:::google"
 */
export function generateJobKey(title: string, company?: string): string {
  const cleanTitle = normalizeJobText(title);
  const cleanCompany = normalizeJobText(company);
  return `${cleanTitle}:::${cleanCompany || 'sem-empresa'}`;
}

/**
 * Verifica se uma vaga é duplicata consultando um conjunto de chaves ou lista de vagas existentes.
 */
export function isDuplicateJob(
  candidate: JobIdentity,
  existingKeys: Set<string>,
): boolean {
  const key = generateJobKey(candidate.title, candidate.company);
  return existingKeys.has(key);
}

/**
 * Cria um Set com as chaves normalizadas a partir de uma lista de vagas.
 */
export function createJobKeySet(jobs: JobIdentity[]): Set<string> {
  const set = new Set<string>();
  for (const job of jobs) {
    if (job && job.title) {
      set.add(generateJobKey(job.title, job.company));
    }
  }
  return set;
}

/**
 * Deduplica um array de vagas em memória, mantendo apenas a primeira ocorrência
 * de cada par (título, empresa) e ignorando chaves já presentes em existingKeys.
 */
export function deduplicateJobs<T extends JobIdentity>(
  jobs: T[],
  existingKeys?: Set<string>,
): T[] {
  const seen = existingKeys ? new Set<string>(existingKeys) : new Set<string>();
  const uniqueJobs: T[] = [];

  for (const job of jobs) {
    if (!job || !job.title) continue;
    const key = generateJobKey(job.title, job.company);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueJobs.push(job);
    }
  }

  return uniqueJobs;
}

/**
 * Serviço injetável do NestJS para deduplicação de vagas por título e empresa.
 */
@Injectable()
export class JobDeduplicationService {
  normalize(text?: string): string {
    return normalizeJobText(text);
  }

  createKey(title: string, company?: string): string {
    return generateJobKey(title, company);
  }

  isDuplicate(candidate: JobIdentity, existingKeys: Set<string>): boolean {
    return isDuplicateJob(candidate, existingKeys);
  }

  createKeySet(jobs: JobIdentity[]): Set<string> {
    return createJobKeySet(jobs);
  }

  deduplicate<T extends JobIdentity>(
    jobs: T[],
    existingKeys?: Set<string>,
  ): T[] {
    return deduplicateJobs(jobs, existingKeys);
  }
}
