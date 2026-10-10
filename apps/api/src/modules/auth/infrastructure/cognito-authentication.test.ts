import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoAuthentication, type CognitoLinkedUser } from './cognito-authentication.js';
import { AuthenticationError } from '../domain/authentication-error.js';
import { AuthService } from '../application/auth.service.js';
import { InMemoryUserRepository } from '../../users/infrastructure/in-memory-user.repository.js';

const linked: CognitoLinkedUser = { id: 'internal-user', cognitoSub: 'stable-subject', role: 'CASHIER', status: 'ACTIVE' };
const pool = 'us-east-1_OfflineTest';
const clientId = 'offline-client';
const issuer = `https://cognito-idp.us-east-1.amazonaws.com/${pool}`;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const verifier = CognitoJwtVerifier.create({ userPoolId: pool, clientId, tokenUse: 'access' });
const publicJwk = keys.publicKey.export({ format: 'jwk' });
assert.ok(publicJwk.n && publicJwk.e);
verifier.cacheJwks({ keys: [{ kty: 'RSA', n: publicJwk.n, e: publicJwk.e, kid: 'offline-key', alg: 'RS256', use: 'sig' }] });
function token(overrides: Record<string, unknown> = {}, signingKey = keys.privateKey) {
  return jwt.sign({ sub: linked.cognitoSub, iss: issuer, client_id: clientId, token_use: 'access',
    exp: Math.floor(Date.now() / 1000) + 300, 'cognito:groups': ['ADMIN'], ...overrides },
    signingKey, { algorithm: 'RS256', keyid: 'offline-key' });
}

test('Cognito verifies signed access token offline and uses application role and stable sub', async () => {
  let lookedUp = '';
  const authentication = new CognitoAuthentication(verifier, async sub => { lookedUp = sub; return linked; });
  assert.deepEqual(await authentication.authenticate(`Bearer ${token()}`), { userId: linked.id, role: 'CASHIER' });
  assert.equal(lookedUp, linked.cognitoSub);
  assert.throws(() => authentication.createToken({ userId: linked.id, role: linked.role }), AuthenticationError);
});

test('Cognito rejects expired, wrong issuer/client, ID tokens and invalid signatures before user lookup', async () => {
  let lookups = 0;
  const authentication = new CognitoAuthentication(verifier, async () => { lookups++; return linked; });
  for (const claims of [{ exp: 1 }, { iss: 'https://wrong.invalid' }, { client_id: 'wrong' }, { token_use: 'id', aud: clientId }]) {
    await assert.rejects(authentication.authenticate(`Bearer ${token(claims)}`), AuthenticationError);
  }
  const wrongKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(authentication.authenticate(`Bearer ${token({}, wrongKeys.privateKey)}`), AuthenticationError);
  for (const header of [undefined, 'Basic x', 'Bearer', 'Bearer token extra']) {
    await assert.rejects(authentication.authenticate(header), AuthenticationError);
  }
  assert.equal(lookups, 0);
});

test('unlinked, inactive and mismatched subjects cannot access application', async () => {
  for (const user of [null, { ...linked, status: 'INACTIVE' as const }, { ...linked, cognitoSub: 'other' }]) {
    const authentication = new CognitoAuthentication(verifier, async () => user);
    await assert.rejects(authentication.authenticate(`Bearer ${token()}`), AuthenticationError);
  }
});

test('Cognito mode blocks local password login before lookup or hashing', async () => {
  const authentication = new CognitoAuthentication(verifier, async () => linked);
  const users = new InMemoryUserRepository();
  users.findByUsername = async () => { throw new Error('Local credentials must not be read'); };
  const service = new AuthService(users, {
    hash: async () => { throw new Error('Local hashing forbidden'); },
    verify: async () => { throw new Error('Local verification forbidden'); }
  }, authentication);
  await assert.rejects(service.login('admin', 'password'), AuthenticationError);
});
