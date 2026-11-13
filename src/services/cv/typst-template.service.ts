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
  projects: 'Projetos',
  education: 'Educação',
  technologies: 'Habilidades Técnicas',
  languages: 'Certificações e Idiomas',
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
   * Ensures name, contact, education, languages, and certifications are strictly preserved.
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
      certifications: baseCv.certifications,

      // Tailorable fields with safe fallback to baseCv
      headline:
        patch.headline && patch.headline.trim().length > 0
          ? patch.headline.trim()
          : baseCv.headline,
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
   * matching the layout of Jose_Henrique_CV_Programador_Pleno.pdf.
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
        `#underline[#link("${emailUrl}")[${this.escapeTypst(cvData.contact.email)}]]`,
      );
    }
    if (cvData.contact?.phone) {
      contactParts.push(this.escapeTypst(cvData.contact.phone));
    }
    if (cvData.contact?.linkedin) {
      const linkedinClean = cvData.contact.linkedin.replace(
        /^https?:\/\/(www\.)?/,
        '',
      );
      const linkedinHref = cvData.contact.linkedin.startsWith('http')
        ? cvData.contact.linkedin
        : `https://${cvData.contact.linkedin}`;
      contactParts.push(
        `#underline[#link("${this.escapeTypstStringLiteral(linkedinHref)}")[${this.escapeTypst(linkedinClean)}]]`,
      );
    }
    if (cvData.contact?.github) {
      const githubClean = cvData.contact.github.replace(
        /^https?:\/\/(www\.)?/,
        '',
      );
      const githubHref = cvData.contact.github.startsWith('http')
        ? cvData.contact.github
        : `https://${cvData.contact.github}`;
      contactParts.push(
        `#underline[#link("${this.escapeTypstStringLiteral(githubHref)}")[${this.escapeTypst(githubClean)}]]`,
      );
    }
    if (cvData.contact?.website) {
      const webClean = cvData.contact.website.replace(
        /^https?:\/\/(www\.)?/,
        '',
      );
      const webHref = cvData.contact.website.startsWith('http')
        ? cvData.contact.website
        : `https://${cvData.contact.website}`;
      contactParts.push(
        `#underline[#link("${this.escapeTypstStringLiteral(webHref)}")[${this.escapeTypst(webClean)}]]`,
      );
    }

    const headlineLine = cvData.headline
      ? `\n  #v(-4pt)\n  #text(size: 10pt)[${this.escapeTypst(cvData.headline)}]`
      : '';

    const experienceBlock = this.renderExperience(cvData.experience || []);
    const projectsBlock = this.renderProjects(cvData.projects || []);
    const educationBlock = this.renderEducation(cvData.education || []);
    const technologiesBlock = this.renderTechnologies(
      cvData.technologies || {},
    );
    const languagesBlock = this.renderCertificationsAndLanguages(
      cvData.certifications || [],
      cvData.languages || [],
    );

    return `#set document(
  title: "${this.escapeTypstStringLiteral(docTitle)}",
  author: "${this.escapeTypstStringLiteral(cvData.name)}",
)

#set page(
  paper: "a4",
  margin: (top: 1.5cm, bottom: 1.5cm, left: 1.6cm, right: 1.6cm),
)

#set text(
  font: ("Liberation Serif", "DejaVu Serif", "Linux Libertine", "Times New Roman"),
  size: 10pt,
  fill: rgb("#000000"),
)

#set par(
  justify: false,
  leading: 0.52em,
)

#let section-header(title) = {
  v(6pt)
  text(size: 11pt, weight: "regular")[#smallcaps[#title]]
  v(-6pt)
  line(length: 100%, stroke: 0.5pt + rgb("#000000"))
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
  #text(size: 22pt, weight: "bold")[${this.escapeTypst(cvData.name)}]${headlineLine}
  #v(-3pt)
  #text(size: 9.5pt)[${contactParts.join(' | ')}]
]

#v(2pt)

#section-header("${this.escapeTypstStringLiteral(titles.summary)}")
${this.escapeTypst(cvData.summary)}

#section-header("${this.escapeTypstStringLiteral(titles.experience)}")
${experienceBlock}

#section-header("${this.escapeTypstStringLiteral(titles.projects)}")
${projectsBlock}

#section-header("${this.escapeTypstStringLiteral(titles.education)}")
${educationBlock}

#section-header("${this.escapeTypstStringLiteral(titles.technologies)}")
${technologiesBlock}

#section-header("${this.escapeTypstStringLiteral(titles.languages)}")
${languagesBlock}
`;
  }

  private renderExperience(items: CvExperienceItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map((exp) => {
        const row1 = `#twocol([*${this.escapeTypst(exp.title)}*], [${this.escapeTypst(exp.dates)}])`;
        const row2 = `#twocol([_${this.escapeTypst(exp.company)}_], [_${this.escapeTypst(exp.location)}_])`;

        const bullets = (exp.description || [])
          .filter(Boolean)
          .map((bullet) => `- ${this.escapeTypst(bullet)}`)
          .join('\n');

        return `${row1}
#v(-4pt)
${row2}
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
        if (proj.techStack) {
          titlePart += ` | _${this.escapeTypst(proj.techStack)}_`;
        } else if (proj.link) {
          const href = proj.link.startsWith('http')
            ? proj.link
            : `https://${proj.link}`;
          titlePart += ` | #link("${this.escapeTypstStringLiteral(href)}")[GitHub]`;
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

  private renderEducation(items: CvEducationItem[]): string {
    if (!items || items.length === 0) return '';

    return items
      .map((edu) => {
        const loc = edu.location ? this.escapeTypst(edu.location) : 'Brasil';
        return `#twocol([*${this.escapeTypst(edu.institution)}*], [${loc}])
#v(-4pt)
#twocol([_${this.escapeTypst(edu.degree)}_], [_${this.escapeTypst(edu.dates)}_])`;
      })
      .join('\n#v(3pt)\n');
  }

  private renderTechnologies(tech: CvTechnologies): string {
    const lines: string[] = [];
    if (tech.languages) {
      lines.push(`*Linguagens:* ${this.escapeTypst(tech.languages)}`);
    }
    if (tech.frontend) {
      lines.push(`*Frontend:* ${this.escapeTypst(tech.frontend)}`);
    }
    if (tech.backend) {
      lines.push(`*Backend:* ${this.escapeTypst(tech.backend)}`);
    }
    if (tech.databases) {
      lines.push(`*Bancos de Dados:* ${this.escapeTypst(tech.databases)}`);
    }
    if (tech.devops) {
      lines.push(`*Cloud & DevOps:* ${this.escapeTypst(tech.devops)}`);
    }
    if (tech.aiAndTools) {
      lines.push(`*IA & Ferramentas:* ${this.escapeTypst(tech.aiAndTools)}`);
    }
    if (tech.practices) {
      lines.push(`*Práticas:* ${this.escapeTypst(tech.practices)}`);
    }
    return lines.join(' \\\n');
  }

  private renderCertificationsAndLanguages(
    certifications: string[],
    items: CvLanguageItem[],
  ): string {
    const lines: string[] = [];

    for (const cert of certifications) {
      const parts = cert.split('–');
      if (parts.length > 1) {
        lines.push(
          `*${this.escapeTypst(parts[0].trim())}* – ${this.escapeTypst(parts.slice(1).join('–').trim())}`,
        );
      } else {
        lines.push(this.escapeTypst(cert));
      }
    }

    if (items && items.length > 0) {
      const langLine = items
        .map(
          (lang) =>
            `*${this.escapeTypst(lang.language)}:* ${this.escapeTypst(lang.level)}`,
        )
        .join(' | ');
      lines.push(langLine);
    }

    return lines.join(' \\\n');
  }
}
