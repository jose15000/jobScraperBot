import { Injectable } from '@nestjs/common';
import { ScrapedPost } from '../interfaces/ScrapedPost/iscrapedpost.interface';

export interface JobIdentity {
  title: string;
  company?: string;
}

export interface NormalizedCandidateJob {
  title: string;
  company: string;
  text: string;
  location?: string;
  url: string;
}

/**
 * Normaliza um post raspado garantindo título, empresa limpa e URL determinística.
 */
export function normalizeScrapedPost(
  post: ScrapedPost,
): NormalizedCandidateJob | null {
  const text = (post.text || '').trim();
  if (!text && !post.title) return null;

  let title = post.title?.trim() || '';
  let company = post.company?.trim() || '';

  const formattedMatch = (title || text).match(
    /^Vaga:\s*(.*?)(?:\s*\|\s*Empresa:\s*(.*))?$/i,
  );
  if (formattedMatch) {
    title = formattedMatch[1]?.trim() || title;
    if (!company && formattedMatch[2]) {
      company = formattedMatch[2].trim();
    }
  }

  if (!title) {
    title =
      text
        .split('\n')[0]
        .replace(/[#*•-]/g, '')
        .trim()
        .substring(0, 100) || 'Desenvolvedor';
  }

  if (company) {
    company = company.replace(/\d+([.,]\d+)?\s*$/, '').trim();
  }

  let url = post.url?.trim() || '';
  if (!url) {
    const hash = Buffer.from(text || title)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 50);
    url = `urn:job-hash:${hash}`;
  }

  return {
    title,
    company,
    text: text || `Vaga: ${title}`,
    location: post.location,
    url,
  };
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
