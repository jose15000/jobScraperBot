import { ILocationOption } from '../isearch/isearch.interface';
import { UserProfileCriteria } from '../../utils/jev';
import { CvOptimizationConfig } from '../cv/cv.interface';

export interface AppJobConfig {
  search: {
    queries: string[];
    locations: ILocationOption[];
  };
  profile?: Partial<UserProfileCriteria>;
  cvOptimization?: Partial<CvOptimizationConfig>;
}
