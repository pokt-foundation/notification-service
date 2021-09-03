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

export type LambdaLog = {
  aws: Aws;
  lambda: Lambda;
  id: string;
  level: string;
  timestamp: (string | number)[];
  message: string;
  hourstamp: string;
  relaysUsed: number;
  maxRelays: number;
  percentageUsed: number;
}

export type LoadBalancerLog = LambdaLog & {
  loadBalancerName: string;
  loadBalancerApps?: string[];
  loadBalancerId: string;
}

export type ApplicationLog = LambdaLog & {
  applicationAddress: string,
  applicationPublicKey: string,
}