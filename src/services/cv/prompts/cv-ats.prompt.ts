import { BaseCvData } from '../../../interfaces/cv/cv.interface';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildAtsCvOptimizationPrompt(
  baseCv: BaseCvData,
  jobInfo: {
    title: string;
    company?: string;
    description: string;
  },
): LlmChatMessage[] {
  const mutableBasePayload = {
    summary: baseCv.summary,
    experience: baseCv.experience,
    projects: baseCv.projects,
    technologies: baseCv.technologies,
    sectionTitles: baseCv.sectionTitles,
  };

  const systemPrompt = `Você é um especialista sênior em engenharia de currículos para sistemas ATS (Gupy, Greenhouse, Lever, Workday) com restrição rigorosa de credibilidade factual para triagem técnica humana.

Seu objetivo é adaptar cirurgicamente as seções fornecidas do currículo do candidato para maximizar a pontuação de match na vaga alvo, SEM inventar empresas, datas ou cargos inexistentes e SEM gerar texto robótico ou inverossímil.

### REGRAS ABSOLUTAS (NÃO NEGOCIÁVEIS):
1. Preservação Factual:
   - Mantenha exatamente as mesmas empresas, períodos (dates) e projetos reais do candidato.
   - Você pode ajustar levemente o título do cargo (ex: "Engenheiro de Software" / "Desenvolvedor Full Stack" / "Desenvolvedor Front-End") para alinhar à nomenclatura da vaga, evitando rótulos redutores se a vaga não os exigir.
2. Extração e Densidade Controlada de Palavras-Chave (ATS):
   - Identifique de 5 a 8 palavras-chave técnicas obrigatórias da vaga (linguagens, frameworks, bancos, arquitetura, práticas).
   - Inclua essas palavras-chave de forma natural:
     a) No "summary" (resumo profissional);
     b) No primeiro bullet ("description[0]") da experiência mais relevante, descrevendo ação técnica e impacto concreto;
     c) Na seção "technologies", priorizando na frente as tecnologias exigidas na vaga.
   - Caso uma tecnologia exigida pela vaga não seja a stack principal de uma experiência anterior, integre-a com honestidade técnica nos projetos ou tecnologias (ou como exposição prática / integração).
3. Requisitos Transversais:
   - Se a vaga mencionar APIs REST, testes automatizados, Git, CI/CD, Docker, Clean Code, SOLID ou metodologias ágeis (Scrum/Kanban), garanta que esses termos constem literalmente nos bullets e habilidades.
4. Idioma:
   - O JSON de saída DEVE seguir integralmente o idioma da descrição da vaga:
     * Se a vaga estiver em português -> gere todo o texto e "sectionTitles" em português.
     * Se a vaga estiver em inglês -> traduza todo o texto, períodos e "sectionTitles" ("Summary", "Professional Experience", "Projects", "Technical Skills", "Education", "Languages") para inglês profissional.
5. Formato de Saída:
   - Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown, sem comentários e sem texto antes ou depois) seguindo exatamente a estrutura solicitada.`;

  const userPrompt = `### DADOS DA VAGA ALVO:
- Cargo: ${jobInfo.title}
- Empresa: ${jobInfo.company || 'Não informada'}
- Descrição / Requisitos:
${jobInfo.description}

### CURRÍCULO BASE DO CANDIDATO (JSON):
${JSON.stringify(mutableBasePayload, null, 2)}

Retorne APENAS o JSON atualizado no formato exato abaixo:
{
  "summary": "Resumo profissional otimizado para a vaga...",
  "experience": [
    {
      "title": "Cargo alinhado",
      "company": "Empresa original",
      "location": "Local original",
      "dates": "Período original",
      "description": [
        "Primeiro bullet iniciando com keyword principal e impacto...",
        "Segundo bullet..."
      ]
    }
  ],
  "projects": [
    {
      "name": "Nome do projeto original",
      "link": "URL original",
      "dates": "Data original",
      "description": [
        "Bullet destacando tecnologias relevantes para a vaga..."
      ]
    }
  ],
  "technologies": {
    "languages": "Lista priorizada...",
    "frontend": "Lista priorizada...",
    "backend": "Lista priorizada...",
    "databases": "Lista priorizada...",
    "devops": "Lista priorizada..."
  },
  "sectionTitles": {
    "summary": "Resumo Profissional",
    "experience": "Experiência Profissional",
    "projects": "Projetos Relevantes",
    "technologies": "Tecnologias & Habilidades",
    "education": "Formação Acadêmica",
    "languages": "Idiomas"
  }
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
