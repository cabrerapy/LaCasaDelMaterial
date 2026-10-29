import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../../.data/operator-application/remaining-authority-20261028/', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('review.json', root), 'utf8'));
const byName = suffix => plan.policies.find(p => p.name.endsWith(suffix));
const logs = byName('logs-creation-tagging');
const start = logs.document.Statement[0].Condition.DateGreaterThanEquals['aws:CurrentTime'];
const base = {
  'aws:PrincipalArn': [plan.principal], 'aws:PrincipalAccount': ['088668667831'],
  'aws:RequestedRegion': ['us-east-1'], 'aws:CurrentTime': [start], 'aws:SecureTransport': ['true'],
  'aws:RequestTag/Project': ['LaCasaDelMaterial'], 'aws:RequestTag/Environment': ['production'],
  'aws:TagKeys': ['Project', 'Environment']
};
const logArn = logs.document.Statement[0].Resource[0];
const cases = [
  ['logs-own', logs, 'logs:TagLogGroup', logArn, 'allowed', {}],
  ['logs-other-group', logs, 'logs:TagLogGroup', logArn.replace('-api:', '-other:'), 'implicitDeny', {}],
  ['logs-other-role', logs, 'logs:TagLogGroup', logArn, 'implicitDeny', { 'aws:PrincipalArn': ['arn:aws:iam::088668667831:role/other'] }],
  ['logs-expired', logs, 'logs:TagLogGroup', logArn, 'implicitDeny', { 'aws:CurrentTime': [plan.expiresAt] }],
  ['logs-http', logs, 'logs:TagLogGroup', logArn, 'implicitDeny', { 'aws:SecureTransport': ['false'] }],
  ['logs-no-delete', logs, 'logs:DeleteLogGroup', logArn, 'implicitDeny', {}],
  ['api-own', byName('initial-tagging'), 'apigateway:POST', 'arn:aws:apigateway:us-east-1::/tags/arn%3Aaws%3Aapigateway%3Aus-east-1%3A%3A%2Fv2%2Fapis%2Fqa123', 'allowed', {}],
  ['api-no-pool', byName('initial-tagging'), 'cognito-idp:TagResource', 'arn:aws:cognito-idp:us-east-1:088668667831:userpool/us-east-1_test', 'implicitDeny', {}]
];
for (const suffix of ['edge-create', 'edge-tagged-create', 'edge-function', 'edge-distribution-tags', 'edge-initial-lifecycle']) {
  const policy = byName(suffix);
  const s = policy.document.Statement[0];
  const resource = s.Resource[0] === '*' ? '*' : s.Resource[0].replace(/\*$/, 'review-id');
  cases.push([suffix, policy, s.Action[0], resource, 'allowed', {}]);
}
const manifest = [];
for (const [name, policy, action, resource, expected, changes] of cases) {
  if (!policy) throw new Error('Missing reviewed policy');
  const context = { ...base, ...changes };
  const request = { PolicyInputList: [JSON.stringify(policy.document)], ActionNames: [action], ResourceArns: [resource],
    ContextEntries: Object.entries(context).map(([key, values]) => ({ ContextKeyName: key, ContextKeyValues: values,
      ContextKeyType: key === 'aws:CurrentTime' ? 'date' : key === 'aws:SecureTransport' ? 'boolean' : key === 'aws:TagKeys' ? 'stringList' : 'string' })) };
  const file = `simulate-${name}.json`;
  writeFileSync(new URL(file, root), JSON.stringify(request), { flag: 'wx' });
  manifest.push({ name, file, expected });
}
writeFileSync(new URL('simulation-manifest.json', root), JSON.stringify(manifest), { flag: 'wx' });
console.log('SIMULATION_REQUESTS_PREPARED_NOT_SENT: ' + manifest.length);
