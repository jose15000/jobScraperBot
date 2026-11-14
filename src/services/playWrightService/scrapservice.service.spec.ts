import { Test, TestingModule } from '@nestjs/testing';
import { PlaywrightService } from './scrapservice.service';
import {
  glassdoorProvider,
  linkedinProvider,
  remotarProvider,
} from '../../config/providers';

describe('PlaywrightService', () => {
  let service: PlaywrightService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaywrightService],
    }).compile();

    service = module.get<PlaywrightService>(PlaywrightService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('filters locations by provider and remote support correctly', () => {
    const remoteLoc = {
      label: 'Remoto (Brasil)',
      workplaceTypes: ['remote' as const],
    };
    const curitibaGlassdoorLoc = {
      provider: 'glassdoor' as const,
      label: 'Curitiba',
      workplaceTypes: ['onsite' as const, 'hybrid' as const],
    };
    const spLinkedinLoc = {
      provider: 'linkedin' as const,
      label: 'São Paulo',
      workplaceTypes: ['onsite' as const],
    };

    expect(service.isLocationSupported(remotarProvider, remoteLoc)).toBe(true);
    expect(
      service.isLocationSupported(remotarProvider, curitibaGlassdoorLoc),
    ).toBe(false);

    expect(
      service.isLocationSupported(glassdoorProvider, curitibaGlassdoorLoc),
    ).toBe(true);
    expect(service.isLocationSupported(glassdoorProvider, spLinkedinLoc)).toBe(
      false,
    );
    expect(service.isLocationSupported(linkedinProvider, spLinkedinLoc)).toBe(
      true,
    );
  });

  it('parses HTML job cards and strips rating suffixes from company names', () => {
    const html = `
      <ul>
        <li>
          <h3 class="base-search-card__title">Desenvolvedor Node.js Pleno</h3>
          <h4 class="base-search-card__subtitle">Decathlon 4,2</h4>
          <a class="base-card__full-link" href="/jobs/view/12345">Ver vaga</a>
        </li>
      </ul>
    `;

    const jobs = service.parseHtml(html, linkedinProvider, 'Remoto');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      title: 'Desenvolvedor Node.js Pleno',
      company: 'Decathlon',
      location: 'Remoto',
      text: 'Vaga: Desenvolvedor Node.js Pleno | Empresa: Decathlon',
      url: 'https://www.linkedin.com/jobs/view/12345',
    });
  });
});
