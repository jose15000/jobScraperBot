import {
  generateJobKey,
  isDuplicateJob,
  createJobKeySet,
  deduplicateJobs,
  normalizeJobText,
  JobDeduplicationService,
} from './deduplication';

describe('Job Deduplication Utils', () => {
  describe('normalizeJobText', () => {
    it('should lowercase, remove accents and clean punctuation', () => {
      expect(normalizeJobText('Desenvolvedor Full-Stack Júnior!')).toBe(
        'desenvolvedor full stack junior',
      );
      expect(normalizeJobText('  Empresa   S.A.  ')).toBe('empresa s a');
      expect(normalizeJobText('')).toBe('');
      expect(normalizeJobText(undefined)).toBe('');
    });
  });

  describe('generateJobKey', () => {
    it('should generate same key for minor variations in title and company', () => {
      const key1 = generateJobKey('Dev Fullstack Pleno', 'Empresa X');
      const key2 = generateJobKey('dev fullstack pleno!', 'empresa x');
      expect(key1).toBe(key2);
      expect(key1).toBe('dev fullstack pleno:::empresa x');
    });

    it('should fallback to sem-empresa when company is omitted', () => {
      const key = generateJobKey('Desenvolvedor React');
      expect(key).toBe('desenvolvedor react:::sem-empresa');
    });
  });

  describe('isDuplicateJob & createJobKeySet', () => {
    it('should identify duplicates against an existing key set', () => {
      const existingJobs = [
        { title: 'Desenvolvedor Frontend Júnior', company: 'TechCorp' },
        { title: 'Backend Node.js', company: 'Startup Y' },
      ];

      const keySet = createJobKeySet(existingJobs);

      expect(
        isDuplicateJob(
          { title: 'desenvolvedor frontend junior', company: 'techcorp' },
          keySet,
        ),
      ).toBe(true);

      expect(
        isDuplicateJob(
          { title: 'Desenvolvedor Frontend Júnior', company: 'OtherCorp' },
          keySet,
        ),
      ).toBe(false);

      expect(
        isDuplicateJob(
          { title: 'Tech Lead React', company: 'TechCorp' },
          keySet,
        ),
      ).toBe(false);
    });
  });

  describe('deduplicateJobs', () => {
    it('should filter duplicates in an array keeping only first occurrence', () => {
      const jobs = [
        { id: 1, title: 'Dev React Jr', company: 'Empresa A' },
        { id: 2, title: 'dev react jr', company: 'empresa a' }, // duplicate
        { id: 3, title: 'Dev Node Pleno', company: 'Empresa B' },
        { id: 4, title: 'Dev React Jr', company: 'Empresa C' }, // different company
      ];

      const unique = deduplicateJobs(jobs);
      expect(unique.length).toBe(3);
      expect(unique.map((j) => j.id)).toEqual([1, 3, 4]);
    });
  });

  describe('JobDeduplicationService (Injectable)', () => {
    let service: JobDeduplicationService;

    beforeEach(() => {
      service = new JobDeduplicationService();
    });

    it('should provide the same functionality when injected as a service', () => {
      const keySet = service.createKeySet([
        { title: 'Engenheiro de Software', company: 'Google' },
      ]);

      expect(
        service.isDuplicate(
          { title: 'engenheiro de software', company: 'google' },
          keySet,
        ),
      ).toBe(true);
    });
  });
});
