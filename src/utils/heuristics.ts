export interface FilterResult {
    shouldApply: boolean;
    score: number;
    matchedKeywords: string[];
    excludedKeywords: string[];
    dealbreakersFound: string[];
    reason: string;
}

// Palavras que indicam fortemente que a publicação é de alguém procurando emprego, e não uma vaga real
const dealbreakers = [
    'open to work',
    'opentowork',
    'busco oportunidade',
    'busco uma oportunidade',
    'me coloco à disposição',
    'procurando oportunidade',
    'procurando recolocação',
    'em busca de recolocação',
    'em busca de uma oportunidade',
    'procurando nova oportunidade',
    'estou à procura de',
    'estou em busca de',
    'minha transição',
    'meu portfólio',
    'olá rede',
    'gostaria de compartilhar',
    'estou a procura',
    'busco recolocação',
    'procurando vaga',
];

// Termos que indicam que a publicação é uma oportunidade real
const hiringIndicators = [
    'contratando',
    'hiring',
    'we are hiring',
    'vaga',
    'oportunidade',
    'processo seletivo',
    'inscrições',
    'link da vaga',
    'se candidatar',
    'candidatar-se',
    'envie seu currículo',
    'enviar currículo',
    'temos vaga',
    'estamos com vaga',
    'abrimos vaga',
    'vagas abertas',
];

// Tecnologias desejadas
const desiredTechs = [
    'react',
    'reactjs',
    'react.js',
    'nextjs',
    'next.js',
    'typescript',
    'javascript',
    'node',
    'nodejs',
    'node.js',
    'nestjs',
    'nest.js',
    'frontend',
    'front-end',
    'front end',
    'web',
    'css',
    'tailwind',
];

// Níveis de senioridade buscados
const juniorKeywords = [
    'junior',
    'júnior',
    'jr',
    'trainee',
    'iniciante',
    'sem experiência',
    'pleno',
    'pl',
];

// Senioridades indesejadas
const seniorKeywords = [
    'senior',
    'sênior',
    'sr',
    'tech lead',
    'lead',
    'coordenador',
    'gerente',
    'principal',
];

// Termos de trabalho remoto
const remoteKeywords = [
    'remoto',
    'remote',
    'home office',
    'home-office',
    'anywhere',
    'teletrabalho',
];

// --- Funções auxiliares ---

function matchWords(content: string, words: string[]): string[] {
    return words.filter(w => content.includes(w));
}

function matchRegex(content: string, words: string[]): string[] {
    return words.filter(w => {
        const regex = new RegExp(`\\b${w.replace('.', '\\.')}\\b`, 'i');
        return regex.test(content);
    });
}

/**
 * Executa a heurística completa de filtragem de vagas.
 * Retorna um FilterResult com a pontuação, palavras encontradas e decisão final.
 */
export function runJobHeuristic(content: string): FilterResult {
    if (!content) {
        return {
            shouldApply: false, score: 0,
            matchedKeywords: [], excludedKeywords: [], dealbreakersFound: [],
            reason: 'Conteúdo vazio ou inválido',
        };
    }

    const text = content.toLowerCase();
    const matchedKeywords: string[] = [];
    const excludedKeywords: string[] = [];

    // 1. Dealbreakers — candidatos se promovendo
    const dealbreakersFound = matchWords(text, dealbreakers);
    if (dealbreakersFound.length > 0) {
        return {
            shouldApply: false, score: -100,
            matchedKeywords, excludedKeywords, dealbreakersFound,
            reason: `Publicação de candidato detectada (${dealbreakersFound.join(', ')})`,
        };
    }

    // 2. Indicadores de contratação (+15 pts cada)
    const hiringMatches = matchWords(text, hiringIndicators);
    matchedKeywords.push(...hiringMatches);
    const hiringScore = hiringMatches.length * 15;

    // 3. Tecnologias da stack (+10 pts cada)
    const techMatches = matchRegex(text, desiredTechs);
    matchedKeywords.push(...techMatches);
    const techScore = techMatches.length * 10;

    // 4. Senioridade júnior (+20 pts) vs sênior (-15 pts)
    const juniorMatches = matchRegex(text, juniorKeywords);
    matchedKeywords.push(...juniorMatches);

    const seniorMatches = matchRegex(text, seniorKeywords);
    excludedKeywords.push(...seniorMatches);

    // Se tiver sênior/pleno e NÃO tiver júnior, elimina
    if (seniorMatches.length > 0 && juniorMatches.length === 0) {
        return {
            shouldApply: false, score: -50,
            matchedKeywords, excludedKeywords, dealbreakersFound,
            reason: 'Vaga destinada apenas para níveis superiores (Pleno/Sênior/Lead)',
        };
    }

    const seniorityScore = (juniorMatches.length * 20) - (seniorMatches.length * 15);

    // 5. Trabalho remoto (+20 pts cada)
    const remoteMatches = matchWords(text, remoteKeywords);
    matchedKeywords.push(...remoteMatches);
    const remoteScore = remoteMatches.length * 20;

    // 6. Pontuação final
    const score = hiringScore + techScore + seniorityScore + remoteScore;
    const shouldApply = hiringMatches.length > 0 && techMatches.length > 0 && score >= 30;

    let reason = 'Aprovada na filtragem heurística';
    if (!shouldApply) {
        if (hiringMatches.length === 0) reason = 'Sem termos claros de contratação';
        else if (techMatches.length === 0) reason = 'Nenhuma tecnologia corresponde à stack';
        else reason = `Pontuação insuficiente (${score} pts, mínimo 30)`;
    }

    return { shouldApply, score, matchedKeywords, excludedKeywords, dealbreakersFound, reason };
}