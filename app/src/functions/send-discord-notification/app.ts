import { getQueryResults } from '../../lib/datadog';
import { LoadBalancerLog } from '../../models/datadog';

exports.handler = async (event: any, context: any) => {
  const res = await getQueryResults<LoadBalancerLog>('Load Balancer over 100 %')


  return { message: 'discord' }
}