import { runtimeResourceNames } from './runtime-resource-names.js';

/** HTTP V2 candidate only; no execute-api access or PassRole.
 * Management ARNs omit account. PrincipalAccount limits the calling account.
 * Tags do not uniquely identify an API; handler tag context and tagging endpoints
 * remain unverified. No permissive fallback when that context is missing.
 */
export function deploymentApiPermissions(account: string, region: string) {
  const names = runtimeResourceNames(account, region);
  const collection = `arn:aws:apigateway:${region}::/apis`;
  const owned = { StringEquals: { 'aws:PrincipalAccount': account, 'aws:RequestedRegion': region,
    'aws:ResourceTag/Project': 'LaCasaDelMaterial', 'aws:ResourceTag/Environment': 'production' } };
  return { Version: '2012-10-17', Statement: [
    { Sid: 'ExecutorCreateNamedTaggedHttpApi', Effect: 'Allow', Action: ['apigateway:POST'],
      Resource: [collection], Condition: { StringEquals: {
        'aws:PrincipalAccount': account, 'aws:RequestedRegion': region,
        'apigateway:Request/ApiName': names.apiName,
        'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production'
      } } },
    // This wildcard includes descendants, not just API roots. All require tags.
    { Sid: 'ExecutorReadUpdateDeleteTaggedApiTree', Effect: 'Allow',
      Action: ['apigateway:GET', 'apigateway:PATCH', 'apigateway:DELETE'],
      Resource: [`${collection}/*`], Condition: owned },
    { Sid: 'ExecutorCreateTaggedApiChildren', Effect: 'Allow', Action: ['apigateway:POST'],
      Resource: [`${collection}/*/integrations`, `${collection}/*/routes`, `${collection}/*/stages`],
      Condition: owned }
  ] };
}
