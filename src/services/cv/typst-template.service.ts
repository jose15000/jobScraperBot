import { Injectable } from '@nestjs/common';
import {
  BaseCvData,
  CvEducationItem,
  CvExperienceItem,
  CvLanguageItem,
  CvProjectItem,
  CvSectionTitles,
  CvTailoredPatchDto,
  CvTechnologies,
} from '../../interfaces/cv/cv.interface';

const DEFAULT_SECTION_TITLES: CvSectionTitles = {
  summary: 'Resumo Profissional',
  experience: 'Experiência Profissional',
  projects: 'Projetos Relevantes',
  technologies: 'Tecnologias & Habilidades',
  education: 'Formação Acadêmica',
  languages: 'Idiomas',
};

@Injectable()
export class TypstTemplateService {
  /**
   * Escapes special Typst markup characters so arbitrary text from YAML or LLM
   * never breaks compilation.
   */
  escapeTypst(value: string | undefined | null): string {
    if (!value) return '';
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/#/g, '\\#')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\$/g, '\\$')
      .replace(/@/g, '\\@')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/`/g, '\\`')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/~/g, '\\~')
      .trim();
  }

  /**
   * Escapes a string for use inside a Typst double-quoted string literal ("...").
   */
  escapeTypstStringLiteral(value: string | undefined | null): string {
    if (!value) return '';
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .trim();
  }

  /**
   * Merges immutable fields from BaseCvData with the LLM tailored patch.
   * Ensures name, contact, education, and languages are strictly preserved.
   */
  mergeBaseWithPatch(
    baseCv: BaseCvData,
    patch?: Partial<CvTailoredPatchDto>,
  ): BaseCvData {
    if (!patch) {
      return baseCv;
    }

    return {
      // Immutable fields strictly from baseCv
      name: baseCv.name,
      contact: { ...baseCv.contact },
      education: baseCv.education,
      languages: baseCv.languages,

      // Tailorable fields with safe fallback to baseCv
      summary:
        patch.summary && patch.summary.trim().length > 0
          ? patch.summary.trim()
          : baseCv.summary,
      experience:
        Array.isArray(patch.experience) && patch.experience.length > 0
          ? patch.experience
          : baseCv.experience,
      projects:
        Array.isArray(patch.projects) && patch.projects.length > 0
          ? patch.projects
          : baseCv.projects,
      technologies:
        patch.technologies && Object.keys(patch.technologies).length > 0
          ? { ...baseCv.technologies, ...patch.technologies }
          : baseCv.technologies,
      sectionTitles: {
        ...DEFAULT_SECTION_TITLES,
        ...baseCv.sectionTitles,
        ...(patch.sectionTitles || {}),
      },
    };
  }

  /**
   * Builds a complete, self-contained, ATS-readable Typst (.typ) document
   * styled after RenderCV / JobEZ template.tex.
   */
  renderTypstDocument(
    cvData: BaseCvData,
    jobMetadata?: { title?: string; company?: string },
  ): string {
    const titles: CvSectionTitles = {
      ...DEFAULT_SECTION_TITLES,
      ...(cvData.sectionTitles || {}),
    };

    const docTitle = jobMetadata?.title
      ? `${cvData.name} - ${jobMetadata.title}`
      : `${cvData.name} - Currículo`;

    const contactParts: string[] = [];
    if (cvData.contact?.email) {
      const emailUrl = `mailto:${this.escapeTypstStringLiteral(cvData.contact.email)}`;
      contactParts.push(
        `#link("${emailUrl}")[${this.escapeTypst(cvData.contact.email)}]`,
      );
    }
    if (cvData.contact?.phone) {
      contactParts.push(this.escapeTypst(cvData.contact.phone));
    }
    if (cvData.contact?.location) {
      contactParts.push(this.escapeTypst(cvData.contact.location));
    }
    if (cvData.contact?.linkedin) {
      const linkedinHref = cvData.contact.linkedin.startsWith('http')
        ? cvData.contact.linkedin
        : `https://${cvData.contact.linkedin}`;
      contactParts.push(
        `#link("${this.escapeTypstStringLiteral(linkedinHref)}")[LinkedIn]`,
      );
    }
    if (cvData.contact?.github) {
      const githubHref = cvData.contact.github.startsWith('http')
        ? cvData.contact.github
        : `https://${cvData.contact.github}`;
      contactParts.push(
        `#link("${this.escapeTypstStringLiteral(githubHref)}")[GitHub]`,
      );
    }

    const experienceBlock = this.renderExperience(cvData.experience || []);
    const projectsBlock = this.renderProjects(cvData.projects || []);
    const technologiesBlock = this.renderTechnologies(
      cvData.technologies || {},
    );
    const educationBlock = this.renderEducation(cvData.education || []);
    const languagesBlock = this.renderLanguages(cvData.languages || []);

    return `#set document(
  title: "${this.escapeTypstStringLiteral(docTitle)}",
  author: "${this.escapeTypstStringLiteral(cvData.name)}",
)

#set page(
  paper: "a4",
  margin: (top: 1.6cm, bottom: 1.6cm, left: 1.8cm, right: 1.8cm),
)

#set text(
  font: ("Liberation Serif", "DejaVu Serif", "Linux Libertine", "Times New Roman"),
  size: 10pt,
  fill: rgb("#000000"),
)

#set par(
  justify: true,
  leading: 0.55em,
)

#let section-header(title) = {
  v(6pt)
  text(size: 11.5pt, weight: "bold")[#title]
  v(-6pt)
  line(length: 100%, stroke: 0.6pt + rgb("#000000"))
  v(2pt)
}

#let twocol(left-content, right-content) = {
  grid(
    columns: (1fr, auto),
    column-gutter: 12pt,
    align: (left, right),
    left-content,
    right-content,
  )
}

#align(center)[
  #text(size: 21pt, weight: "bold")[${this.escapeTypst(cvData.name)}]
  #v(-4pt)
  #text(size: 9.5pt)[${contactParts.join('  |  ')}]
]

#v(2pt)

#section-header("${this.escapeTypstStringLiteral(titles.summary)}")
${this.escapeTypst(cvData.summary)}

#section-header("${this.escapeTypstStringLiteral(titles.experience)}")
${experienceBlock}

#section-header("${this.escapeTypstStringLiteral(titles.projects)}")
${projectsBlock}

#section-header("${this.escapeTypstStringLiteral(titles.technologies)}")
${technologiesBlock}

#section-header("${this.escapeTypstStringLiteral(titles.education)}")
${educationBlock}

#section-header("${this.escapeTypstStringLiteral(titles.languages)}")
${languagesBlock}
`;
  }

  private renderExperience(items: CvExperienceItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map((exp) => {
        const companyAndLoc = [
          exp.company ? this.escapeTypst(exp.company) : '',
          exp.location ? this.escapeTypst(exp.location) : '',
        ]
          .filter(Boolean)
          .join(' -- ');

        const headerLeft = companyAndLoc
          ? `*${this.escapeTypst(exp.title)}*, ${companyAndLoc}`
          : `*${this.escapeTypst(exp.title)}*`;

        const bullets = (exp.description || [])
          .filter(Boolean)
          .map((bullet) => `- ${this.escapeTypst(bullet)}`)
          .join('\n');

        return `#twocol([${headerLeft}], [${this.escapeTypst(exp.dates)}])
#v(-2pt)
${bullets}
#v(4pt)`;
      })
      .join('\n\n');
  }

  private renderProjects(items: CvProjectItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map((proj) => {
        let titlePart = `*${this.escapeTypst(proj.name)}*`;
        if (proj.link) {
          const href = proj.link.startsWith('http')
            ? proj.link
            : `https://${proj.link}`;
          titlePart += ` | #link("${this.escapeTypstStringLiteral(href)}")[GitHub / Link]`;
        }

        const datesPart = proj.dates ? this.escapeTypst(proj.dates) : '';
        const bullets = (proj.description || [])
          .filter(Boolean)
          .map((bullet) => `- ${this.escapeTypst(bullet)}`)
          .join('\n');

        return `#twocol([${titlePart}], [${datesPart}])
#v(-2pt)
${bullets}
#v(3pt)`;
      })
      .join('\n\n');
  }

  private renderTechnologies(tech: CvTechnologies): string {
    const lines: string[] = [];
    if (tech.languages) {
      lines.push(`*Linguagens:* ${this.escapeTypst(tech.languages)}`);
    }
    if (tech.frontend) {
      lines.push(`*Front-End:* ${this.escapeTypst(tech.frontend)}`);
    }
    if (tech.backend) {
      lines.push(`*Back-End:* ${this.escapeTypst(tech.backend)}`);
    }
    if (tech.databases) {
      lines.push(`*Bancos de Dados:* ${this.escapeTypst(tech.databases)}`);
    }
    if (tech.devops) {
      lines.push(`*DevOps & Ferramentas:* ${this.escapeTypst(tech.devops)}`);
    }
    return lines.join(' \\\n');
  }

  private renderEducation(items: CvEducationItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map(
        (edu) =>
          `#twocol([*${this.escapeTypst(edu.institution)}*, ${this.escapeTypst(edu.degree)}], [${this.escapeTypst(edu.dates)}])`,
      )
      .join('\n#v(2pt)\n');
  }

  private renderLanguages(items: CvLanguageItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map((lang) => {
        const rightText = lang.certification
          ? this.escapeTypst(lang.certification)
          : '';
        return `#twocol([*${this.escapeTypst(lang.language)}* — ${this.escapeTypst(lang.level)}], [${rightText}])`;
      })
      .join('\n#v(2pt)\n');
  }
}
