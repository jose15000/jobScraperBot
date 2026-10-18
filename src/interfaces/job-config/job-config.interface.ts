import { ILocationOption } from '../isearch/isearch.interface';
import { UserProfileCriteria } from '../../utils/jev';

export interface AppJobConfig {
  search: {
    queries: string[];
    locations: ILocationOption[];
  };
  profile?: Partial<UserProfileCriteria>;
}
