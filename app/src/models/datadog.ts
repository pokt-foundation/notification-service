export type DataDogResponse<T> = {
  meta?: {
    page: {
      after: string
    }
  };
  data: {
    attributes: {
      status: string;
      service: string;
      tags?: (string)[] | null;
      timestamp: string;
      host: string;
      attributes: T;
      message: string;
    };
    type: string;
    id: string;
  }[]
  links?: {
    next: string
  };
}

export type Aws = {
  firehose: { arn: string };
  awslogs: {
    owner: string;
    logStream: string;
    logGroup: string;
  };
}

export type Lambda = {
  arn: string;
  request_id: string;
}

export type LoadBalancerLog = {
  level: string;
  timestamp: (string | number)[];
  loadBalancerName: string;
  aws: Aws;
  maxRelays: number;
  loadBalancerApps?: (string)[] | null;
  relaysUsed: number;
  loadBalancerId: string;
  percentageUsed: number;
  message: string;
  id: string;
  hourstamp: string;
  lambda: Lambda;
}