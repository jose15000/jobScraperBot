import { IProviderConfig } from '../../interfaces/isearch/isearch.interface';
import {
  createGlassdoorProvider,
  glassdoorProvider,
} from './glassdoor';
import {
  createLinkedinProvider,
  linkedinProvider,
} from './linkedin';
import {
  createRemotarProvider,
  remotarProvider,
} from './remotar';
import { PlaywrightService } from '../../services/playWrightService/scrapservice.service';
import { LinkedinApifyService } from '../../services/Linkedin/linkedin-apify.service';

export type BuiltinProviderName = 'linkedin' | 'glassdoor' | 'remotar';

export const PROVIDER_REGISTRY: Record<BuiltinProviderName, IProviderConfig> = {
  linkedin: linkedinProvider,
  glassdoor: glassdoorProvider,
  remotar: remotarProvider,
};

export const DEFAULT_WEB_PROVIDERS: IProviderConfig[] = [
  glassdoorProvider,
  linkedinProvider,
  remotarProvider,
];

/**
 * Resolves an array of provider names ('linkedin', 'glassdoor', 'remotar') or custom `IProviderConfig` objects
 * into ready-to-scrape `IProviderConfig` instances.
 */
export function resolveProviders(
  inputs?: Array<BuiltinProviderName | string | IProviderConfig>,
): IProviderConfig[] {
  if (!inputs || inputs.length === 0) {
    return [...DEFAULT_WEB_PROVIDERS];
  }

  const resolved: IProviderConfig[] = [];
  for (const item of inputs) {
    if (typeof item === 'string') {
      const normalized = item.trim().toLowerCase() as BuiltinProviderName;
      const found = PROVIDER_REGISTRY[normalized];
      if (found) {
        resolved.push(found);
      }
    } else if (item && typeof item === 'object' && 'name' in item) {
      resolved.push(item);
    }
  }

  return resolved.length > 0 ? resolved : [...DEFAULT_WEB_PROVIDERS];
}

export {
  linkedinProvider,
  createLinkedinProvider,
  glassdoorProvider,
  createGlassdoorProvider,
  remotarProvider,
  createRemotarProvider,
  PlaywrightService,
  LinkedinApifyService,
};
