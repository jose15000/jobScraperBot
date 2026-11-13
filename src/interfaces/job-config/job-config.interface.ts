import { ILocationOption } from '../isearch/isearch.interface';
import { UserProfileCriteria } from '../../utils/jev';
import { CvOptimizationConfig } from '../cv/cv.interface';
import { ClassifierProviderConfig } from '../../services/jev/classifier-providers';

export interface AppJobConfig {
  search: {
    queries: string[];
    locations: ILocationOption[];
  };
  profile?: Partial<UserProfileCriteria>;
  classifier?: Partial<ClassifierProviderConfig>;
  cvOptimization?: Partial<CvOptimizationConfig>;
}
