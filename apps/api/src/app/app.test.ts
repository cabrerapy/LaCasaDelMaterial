import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createApp } from './create-app.js';
import { loadConfig } from '../config/environment.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from '../modules/auth/infrastructure/local-jwt-authentication.js';
import { InMemoryUserRepository } from '../modules/users/infrastructure/in-memory-user.repository.js';
import { bootstrapAdmin } from '../modules/auth/application/bootstrap-admin.js';
import { hasPermission } from '@lcm/contracts';
import { InMemoryCategoryRepository } from '../modules/categories/infrastructure/in-memory-category.repository.js';
import { InMemoryProductRepository } from '../modules/products/infrastructure/in-memory-product.repository.js';
import { toDisplayQuantity, toInternalQuantity } from '../modules/products/domain/product.js';
import { InMemorySupplierRepository } from '../modules/suppliers/infrastructure/in-memory-supplier.repository.js';

const adminPassword = 'LocalTestPassword123!';
const jwtSecret = 'test-secret-with-at-least-thirty-two-characters';
let app: FastifyInstance;
let users: InMemoryUserRepository;
let categories: InMemoryCategoryRepository;
let products: InMemoryProductRepository;
let suppliers: InMemorySupplierRepository;

before(async () => {
  users = new InMemoryUserRepository();
  categories = new InMemoryCategoryRepository();
  products = new InMemoryProductRepository();
  suppliers = new InMemorySupplierRepository();
  const now = new Date().toISOString();
  await users.create({
    id: 'b052fa5e-e405-4460-82c8-6887137c885a',
    name: 'Administrador',
    username: 'admin',
    email: 'admin@lacasadelmaterial.local',
    passwordHash: await argon2.hash(adminPassword),
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  });
  await users.create({
    id: '50f4b568-e60a-4381-a7c3-c6d635c1b767',
    name: 'Caja',
    username: 'cashier',
    email: 'cashier@lacasadelmaterial.local',
    passwordHash: await argon2.hash(adminPassword),
    role: 'CASHIER',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'b052fa5e-e405-4460-82c8-6887137c885a',
    updatedBy: 'b052fa5e-e405-4460-82c8-6887137c885a'
  });
  await users.create({
    id: 'b7f19320-9b5e-48a1-bfc2-7224a69682e4', name: 'Gerencia', username: 'manager',
    email: 'manager@lacasadelmaterial.local', passwordHash: await argon2.hash(adminPassword),
    role: 'MANAGER', status: 'ACTIVE', createdAt: now, updatedAt: now,
    createdBy: 'b052fa5e-e405-4460-82c8-6887137c885a',
    updatedBy: 'b052fa5e-e405-4460-82c8-6887137c885a'
  });
  await users.create({
    id: '0aab03d6-a7e7-4e74-9c80-c7b8b9d82e49', name: 'Compras', username: 'purchasing',
    email: 'purchasing@lacasadelmaterial.local', passwordHash: await argon2.hash(adminPassword),
    role: 'PURCHASING', status: 'ACTIVE', createdAt: now, updatedAt: now,
    createdBy: 'b052fa5e-e405-4460-82c8-6887137c885a',
    updatedBy: 'b052fa5e-e405-4460-82c8-6887137c885a'
  });
  await users.create({
    id: '0f67e992-05df-4412-a909-91224f478c47',
    name: 'Chofer',
    username: 'driver',
    email: 'driver@lacasadelmaterial.local',
    passwordHash: await argon2.hash(adminPassword),
    role: 'DRIVER',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'b052fa5e-e405-4460-82c8-6887137c885a',
    updatedBy: 'b052fa5e-e405-4460-82c8-6887137c885a'
  });

  const config = loadConfig({
    NODE_ENV: 'test',
    INITIAL_ADMIN_PASSWORD: adminPassword,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '8h'
  });
  app = await createApp(config, {
    users,
    categories,
    products,
    suppliers,
    passwordHasher: new Argon2PasswordHasher(),
    authentication: new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn)
  });
});

after(async () => {
  await app.close();
});

async function login(password = adminPassword, username = 'admin') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password }
  });
}

test('GET /api/health remains public', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
});

test('login succeeds with valid credentials', async () => {
  const response = await login();
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.username, 'admin');
  assert.equal(typeof response.json().accessToken, 'string');
});

test('login rejects an incorrect password with a generic message', async () => {
  const response = await login('incorrect-password');
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, 'Credenciales inválidas');
});

test('login rejects an unknown user with the same generic message', async () => {
  const response = await login(adminPassword, 'unknown');
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, 'Credenciales inválidas');
});

test('/auth/me returns the authenticated user', async () => {
  const accessToken = loginToken(await login());
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().role, 'ADMIN');
  assert.equal(response.json().email, 'admin@lacasadelmaterial.local');
});

test('/auth/me rejects a missing token', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(response.statusCode, 401);
});

test('/auth/me rejects an invalid token', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: 'Bearer invalid-token' }
  });
  assert.equal(response.statusCode, 401);
});

test('/auth/me rejects an expired token', async () => {
  const expiredToken = jwt.sign(
    { role: 'ADMIN' },
    jwtSecret,
    { subject: 'b052fa5e-e405-4460-82c8-6887137c885a', expiresIn: -1 }
  );
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${expiredToken}` }
  });
  assert.equal(response.statusCode, 401);
});

test('/auth/protected requires and accepts authentication', async () => {
  const unauthorized = await app.inject({ method: 'GET', url: '/api/auth/protected' });
  assert.equal(unauthorized.statusCode, 401);

  const accessToken = loginToken(await login());
  const authorized = await app.inject({
    method: 'GET',
    url: '/api/auth/protected',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  assert.equal(authorized.statusCode, 200);
});

test('authentication responses never expose passwordHash', async () => {
  const loginResponse = await login();
  const accessToken = loginToken(loginResponse);
  const meResponse = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${accessToken}` }
  });

  assert.equal(loginResponse.body.includes('passwordHash'), false);
  assert.equal(meResponse.body.includes('passwordHash'), false);
});

test('admin bootstrap hashes the password and is idempotent', async () => {
  const users = new InMemoryUserRepository();
  const passwordHasher = new Argon2PasswordHasher();
  const logger = { info: () => undefined } as unknown as FastifyBaseLogger;

  await bootstrapAdmin(users, passwordHasher, adminPassword, logger);
  const created = await users.findByUsername('admin');
  assert.ok(created);
  assert.notEqual(created.passwordHash, adminPassword);
  assert.equal(await passwordHasher.verify(created.passwordHash, adminPassword), true);

  await bootstrapAdmin(users, passwordHasher, 'DifferentPassword123!', logger);
  const unchanged = await users.findByUsername('admin');
  assert.equal(unchanged?.passwordHash, created.passwordHash);
});

test('ADMIN can list users without exposing password hashes', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
    headers: await authorizationHeader('admin')
  });
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().items.length >= 2);
  assert.equal(response.body.includes('passwordHash'), false);
});

test('CASHIER receives 403 when listing users', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
    headers: await authorizationHeader('cashier')
  });
  assert.equal(response.statusCode, 403);
});

test('an unauthenticated request receives 401 for users', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/users' });
  assert.equal(response.statusCode, 401);
});

test('ADMIN creates a user with a hashed password', async () => {
  const response = await createUser({
    name: 'Juan Pérez',
    username: 'juan',
    email: 'juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.includes('passwordHash'), false);
  const stored = await users.findByUsername('juan');
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, 'InitialPassword123!');
  assert.equal(await argon2.verify(stored.passwordHash, 'InitialPassword123!'), true);
});

test('duplicate username fails', async () => {
  const response = await createUser({
    name: 'Otro Juan',
    username: 'juan',
    email: 'otro-juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 409);
});

test('duplicate email fails', async () => {
  const response = await createUser({
    name: 'Email repetido',
    username: 'email-repetido',
    email: 'juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 409);
});

test('ADMIN can deactivate a user and the inactive user cannot log in', async () => {
  const created = await createUser({
    name: 'Usuario temporal',
    username: 'temporal',
    email: 'temporal@example.com',
    password: 'TemporaryPassword123',
    role: 'CASHIER'
  });
  const id = created.json().id as string;
  const statusResponse = await app.inject({
    method: 'PATCH',
    url: `/api/users/${id}/status`,
    headers: await authorizationHeader('admin'),
    payload: { status: 'INACTIVE' }
  });
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.json().status, 'INACTIVE');

  const inactiveLogin = await login('TemporaryPassword123', 'temporal');
  assert.equal(inactiveLogin.statusCode, 401);
});

test('the last active ADMIN cannot be deactivated', async () => {
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/users/b052fa5e-e405-4460-82c8-6887137c885a/status',
    headers: await authorizationHeader('admin'),
    payload: { status: 'INACTIVE' }
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, 'Debe existir al menos un administrador activo');
});

test('the centralized permission matrix separates ADMIN and CASHIER access', () => {
  assert.equal(hasPermission('ADMIN', 'users.read'), true);
  assert.equal(hasPermission('CASHIER', 'users.read'), false);
  assert.equal(hasPermission('CASHIER', 'sales.create'), true);
  assert.equal(hasPermission('DRIVER', 'products.costs.read'), false);
});

let categoryId = '';

test('ADMIN and CASHIER can list categories', async () => {
  const adminResponse = await app.inject({
    method: 'GET', url: '/api/categories', headers: await authorizationHeader('admin')
  });
  const cashierResponse = await app.inject({
    method: 'GET', url: '/api/categories', headers: await authorizationHeader('cashier')
  });
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(cashierResponse.statusCode, 200);
});

test('DRIVER cannot administer categories', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/categories',
    headers: await authorizationHeader('driver'),
    payload: { name: 'Bloqueada' }
  });
  assert.equal(response.statusCode, 403);
});

test('ADMIN creates a category with generated slug and audit actor', async () => {
  const response = await createCategory({
    name: 'Arena', description: 'Arenas finas', sortOrder: 10
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().slug, 'arena');
  categoryId = response.json().id as string;
  const stored = await categories.findById(categoryId);
  assert.equal(stored?.createdBy, 'b052fa5e-e405-4460-82c8-6887137c885a');
});

test('duplicate category names fail regardless of case and spaces', async () => {
  const response = await createCategory({ name: '  ARENA  ' });
  assert.equal(response.statusCode, 409);
});

test('category slug is unique', async () => {
  const created = await createCategory({ name: 'Cemento y Cal' });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().slug, 'cemento-y-cal');
  assert.equal((await createCategory({ name: 'Cemento-y-Cal' })).statusCode, 409);
});

test('category can be updated and regenerates its slug', async () => {
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/categories/${categoryId}`,
    headers: await authorizationHeader('admin'),
    payload: { name: 'Arena Fina', description: 'Nueva descripción', sortOrder: 5 }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().slug, 'arena-fina');
  assert.equal(response.json().sortOrder, 5);
});

test('category status can be deactivated and activated', async () => {
  const headers = await authorizationHeader('admin');
  const inactive = await app.inject({
    method: 'PATCH', url: `/api/categories/${categoryId}/status`, headers,
    payload: { status: 'INACTIVE' }
  });
  assert.equal(inactive.statusCode, 200);
  assert.equal(inactive.json().status, 'INACTIVE');
  const active = await app.inject({
    method: 'PATCH', url: `/api/categories/${categoryId}/status`, headers,
    payload: { status: 'ACTIVE' }
  });
  assert.equal(active.statusCode, 200);
  assert.equal(active.json().status, 'ACTIVE');
});

test('category listing supports search and status filters', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/categories?search=arena&status=ACTIVE',
    headers: await authorizationHeader('cashier')
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].slug, 'arena-fina');
});

test('category endpoints distinguish unauthenticated and forbidden requests', async () => {
  const unauthenticated = await app.inject({ method: 'GET', url: '/api/categories' });
  const forbidden = await app.inject({
    method: 'GET', url: '/api/categories', headers: await authorizationHeader('driver')
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(forbidden.statusCode, 403);
});

test('invalid category input returns 400', async () => {
  const response = await createCategory({ name: ' ' });
  assert.equal(response.statusCode, 400);
});

let arenaProductId = '';
let arenaHalfPresentationId = '';

test('quantity helpers use exact scaled integers and convert back', () => {
  assert.equal(toInternalQuantity(0.5, 1000), 500);
  assert.equal(toInternalQuantity(1, 1000), 1000);
  assert.equal(toInternalQuantity(2.75, 1000), 2750);
  assert.equal(toInternalQuantity(100, 1), 100);
  assert.equal(toInternalQuantity(40, 1), 40);
  assert.equal(toDisplayQuantity(500, 1000), 0.5);
  assert.equal(toDisplayQuantity(2750, 1000), 2.75);
});

test('ADMIN creates Arena with normalized code, scaled quantities, integer money and audit', async () => {
  const response = await createProduct({
    code: ' arena-lav ', name: 'Arena lavada', categoryId, baseUnit: 'M3',
    quantityScale: 1000, minStock: 5.5, trackStock: true,
    presentations: [
      { name: '0,5 m³', sku: 'ARENA-LAV-05', barcode: '1000500', baseQuantity: 0.5, salePriceGuarani: 90000, isDefault: true, sortOrder: 10 },
      { name: '1 m³', sku: 'ARENA-LAV-1', barcode: '1001000', baseQuantity: 1, salePriceGuarani: 175000, sortOrder: 20 }
    ]
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().code, 'ARENA-LAV');
  assert.equal(response.json().minStock, 5.5);
  assert.equal(response.json().presentations[0].baseQuantity, 0.5);
  assert.equal(Number.isInteger(response.json().presentations[0].salePriceGuarani), true);
  assert.equal(response.body.includes('password'), false);
  arenaProductId = response.json().id as string;
  arenaHalfPresentationId = response.json().presentations[0].id as string;
  const stored = await products.findById(arenaProductId);
  const storedPresentations = await products.listPresentations(arenaProductId);
  assert.equal(stored?.minStockInternal, 5500);
  assert.equal(stored?.createdBy, 'b052fa5e-e405-4460-82c8-6887137c885a');
  assert.deepEqual(storedPresentations.map((item) => item.baseQuantityInternal), [500, 1000]);
});

test('creating a product fails for missing or inactive category', async () => {
  const missing = await createProduct(basicProduct('MISSING-CAT', '00000000-0000-4000-8000-000000000001'));
  assert.equal(missing.statusCode, 400);
  const inactiveCategory = await createCategory({ name: 'Temporal inactiva' });
  const inactiveId = inactiveCategory.json().id as string;
  await app.inject({ method: 'PATCH', url: `/api/categories/${inactiveId}/status`, headers: await authorizationHeader('admin'), payload: { status: 'INACTIVE' } });
  const inactive = await createProduct(basicProduct('INACTIVE-CAT', inactiveId));
  assert.equal(inactive.statusCode, 409);
});

test('duplicate product code, SKU and barcode are rejected', async () => {
  assert.equal((await createProduct(basicProduct('ARENA-LAV', categoryId))).statusCode, 409);
  const duplicateSku = basicProduct('OTRO-SKU', categoryId);
  duplicateSku.presentations[0]!.sku = 'ARENA-LAV-05';
  assert.equal((await createProduct(duplicateSku)).statusCode, 409);
  const duplicateBarcode = basicProduct('OTRO-BAR', categoryId);
  duplicateBarcode.presentations[0]!.barcode = '1000500';
  assert.equal((await createProduct(duplicateBarcode)).statusCode, 409);
});

test('CASHIER reads products but cannot create them', async () => {
  const list = await app.inject({ method: 'GET', url: '/api/products', headers: await authorizationHeader('cashier') });
  assert.equal(list.statusCode, 200);
  const create = await app.inject({ method: 'POST', url: '/api/products', headers: await authorizationHeader('cashier'), payload: basicProduct('NO-CASHIER', categoryId) });
  assert.equal(create.statusCode, 403);
});

test('PURCHASING creates products but cannot change sale price; MANAGER can', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/products', headers: await authorizationHeader('purchasing'),
    payload: basicProduct('CEM-CPII', categoryId)
  });
  assert.equal(created.statusCode, 201);
  const productId = created.json().id as string;
  const presentationId = created.json().presentations[0].id as string;
  const denied = await app.inject({
    method: 'PATCH', url: `/api/products/${productId}/presentations/${presentationId}`,
    headers: await authorizationHeader('purchasing'), payload: { salePriceGuarani: 70000 }
  });
  assert.equal(denied.statusCode, 403);
  const allowed = await app.inject({
    method: 'PATCH', url: `/api/products/${productId}/presentations/${presentationId}`,
    headers: await authorizationHeader('manager'), payload: { salePriceGuarani: 70000 }
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().salePriceGuarani, 70000);
});

test('presentation default remains unique and last active presentation cannot be disabled', async () => {
  const create = await app.inject({
    method: 'POST', url: `/api/products/${arenaProductId}/presentations`,
    headers: await authorizationHeader('admin'),
    payload: { name: '2 m³', sku: 'ARENA-LAV-2', baseQuantity: 2, salePriceGuarani: 340000, isDefault: true }
  });
  assert.equal(create.statusCode, 201);
  const all = await products.listPresentations(arenaProductId);
  assert.equal(all.filter((item) => item.status === 'ACTIVE' && item.isDefault).length, 1);

  const only = await createProduct(basicProduct('SOLO', categoryId));
  const onlyProductId = only.json().id as string;
  const onlyPresentationId = only.json().presentations[0].id as string;
  const disable = await app.inject({
    method: 'PATCH', url: `/api/products/${onlyProductId}/presentations/${onlyPresentationId}/status`,
    headers: await authorizationHeader('admin'), payload: { status: 'INACTIVE' }
  });
  assert.equal(disable.statusCode, 409);
});

test('product search supports code and SKU and filters category/status', async () => {
  const headers = await authorizationHeader('cashier');
  const byCode = await app.inject({ method: 'GET', url: '/api/products?search=arena-lav', headers });
  const bySku = await app.inject({ method: 'GET', url: '/api/products?search=ARENA-LAV-05', headers });
  const filtered = await app.inject({ method: 'GET', url: `/api/products?categoryId=${categoryId}&status=ACTIVE`, headers });
  assert.equal(byCode.json().items.some((item: { id: string }) => item.id === arenaProductId), true);
  assert.equal(bySku.json().items.some((item: { id: string }) => item.id === arenaProductId), true);
  assert.equal(filtered.json().items.every((item: { category: { id: string }; status: string }) => item.category.id === categoryId && item.status === 'ACTIVE'), true);
});

test('product immutable fields and audit internals are never accepted or exposed', async () => {
  const response = await app.inject({
    method: 'PATCH', url: `/api/products/${arenaProductId}`,
    headers: await authorizationHeader('admin'), payload: { code: 'CHANGED' }
  });
  assert.equal(response.statusCode, 400);
  const detail = await app.inject({ method: 'GET', url: `/api/products/${arenaProductId}`, headers: await authorizationHeader('admin') });
  assert.equal(detail.body.includes('createdBy'), false);
  assert.equal(detail.body.includes('minStockInternal'), false);
  assert.ok(arenaHalfPresentationId);
});

let supplierId = '';

test('ADMIN creates a supplier with normalized data and authenticated audit', async () => {
  const response = await createSupplier({
    businessName: '  Distribuidora   Central S.A. ', tradeName: 'Distribuidora Central',
    taxId: ' 80012345 - 6 ', phone: '0981 123456', email: 'VENTAS@DISTRIBUIDORA.LOCAL',
    address: 'Ruta principal km 10', city: 'Limpio', notes: 'Proveedor habitual'
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().businessName, 'Distribuidora Central S.A.');
  assert.equal(response.json().taxId, '80012345-6');
  assert.equal(response.json().email, 'ventas@distribuidora.local');
  supplierId = response.json().id as string;
  const stored = await suppliers.findById(supplierId);
  assert.equal(stored?.createdBy, 'b052fa5e-e405-4460-82c8-6887137c885a');
});

test('PURCHASING creates a supplier and supplier without taxId is accepted', async () => {
  const response = await app.inject({
    method: 'POST', url: '/api/suppliers', headers: await authorizationHeader('purchasing'),
    payload: { businessName: 'Proveedor informal', phone: '0982 000000' }
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().taxId, undefined);
  const stored = await suppliers.findById(response.json().id as string);
  assert.equal(stored?.createdBy, '0aab03d6-a7e7-4e74-9c80-c7b8b9d82e49');
});

test('DRIVER cannot access suppliers', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/suppliers', headers: await authorizationHeader('driver') });
  assert.equal(response.statusCode, 403);
});

test('supplier list and detail work without exposing persistence or audit internals', async () => {
  const headers = await authorizationHeader('admin');
  const list = await app.inject({ method: 'GET', url: '/api/suppliers', headers });
  const detail = await app.inject({ method: 'GET', url: `/api/suppliers/${supplierId}`, headers });
  assert.equal(list.statusCode, 200); assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().businessName, 'Distribuidora Central S.A.');
  assert.equal(detail.body.includes('pk'), false); assert.equal(detail.body.includes('createdBy'), false);
  assert.equal(detail.body.includes('normalizedBusinessName'), false);
});

test('duplicate normalized taxId fails', async () => {
  const response = await createSupplier({ businessName: 'Otra distribuidora', taxId: '80012345-6' });
  assert.equal(response.statusCode, 409);
});

test('invalid supplier email fails validation', async () => {
  const response = await createSupplier({ businessName: 'Email inválido', email: 'no-es-email' });
  assert.equal(response.statusCode, 400);
});

test('supplier can be updated without accepting immutable fields', async () => {
  const updated = await app.inject({
    method: 'PATCH', url: `/api/suppliers/${supplierId}`, headers: await authorizationHeader('purchasing'),
    payload: { tradeName: 'Central', city: 'Asunción', notes: '' }
  });
  assert.equal(updated.statusCode, 200); assert.equal(updated.json().tradeName, 'Central');
  assert.equal(updated.json().city, 'Asunción'); assert.equal(updated.json().notes, undefined);
  const immutable = await app.inject({
    method: 'PATCH', url: `/api/suppliers/${supplierId}`, headers: await authorizationHeader('admin'),
    payload: { status: 'INACTIVE' }
  });
  assert.equal(immutable.statusCode, 400);
});

test('ADMIN deactivates and activates a supplier', async () => {
  const headers = await authorizationHeader('admin');
  const inactive = await app.inject({
    method: 'PATCH', url: `/api/suppliers/${supplierId}/status`, headers, payload: { status: 'INACTIVE' }
  });
  assert.equal(inactive.statusCode, 200); assert.equal(inactive.json().status, 'INACTIVE');
  const active = await app.inject({
    method: 'PATCH', url: `/api/suppliers/${supplierId}/status`, headers, payload: { status: 'ACTIVE' }
  });
  assert.equal(active.statusCode, 200); assert.equal(active.json().status, 'ACTIVE');
});

test('supplier search supports name and RUC plus status filter', async () => {
  const headers = await authorizationHeader('cashier');
  const byName = await app.inject({ method: 'GET', url: '/api/suppliers?search=central&status=ACTIVE', headers });
  const byTaxId = await app.inject({ method: 'GET', url: '/api/suppliers?search=80012345-6', headers });
  assert.equal(byName.statusCode, 200); assert.equal(byName.json().items[0].id, supplierId);
  assert.equal(byTaxId.statusCode, 200); assert.equal(byTaxId.json().items[0].id, supplierId);
});

test('supplier endpoints return 401 without login and 403 without permission', async () => {
  const unauthenticated = await app.inject({ method: 'GET', url: '/api/suppliers' });
  const forbidden = await app.inject({
    method: 'POST', url: '/api/suppliers', headers: await authorizationHeader('cashier'),
    payload: { businessName: 'No permitido' }
  });
  assert.equal(unauthenticated.statusCode, 401); assert.equal(forbidden.statusCode, 403);
});

function loginToken(response: { json(): { accessToken: string } }): string {
  return response.json().accessToken;
}

async function authorizationHeader(username: string): Promise<{ authorization: string }> {
  return { authorization: `Bearer ${loginToken(await login(adminPassword, username))}` };
}

async function createUser(payload: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/users',
    headers: await authorizationHeader('admin'),
    payload
  });
}

async function createCategory(payload: Record<string, string | number>) {
  return app.inject({
    method: 'POST',
    url: '/api/categories',
    headers: await authorizationHeader('admin'),
    payload
  });
}

async function createProduct(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/products', headers: await authorizationHeader('admin'), payload });
}

function basicProduct(code: string, selectedCategoryId: string): Record<string, unknown> & {
  presentations: Array<Record<string, unknown>>;
} {
  return {
    code, name: `Producto ${code}`, categoryId: selectedCategoryId, baseUnit: 'BAG',
    quantityScale: 1, minStock: 20, trackStock: true,
    presentations: [{
      name: 'Bolsa 50 kg', sku: `${code}-B50`, barcode: `BAR-${code}`,
      baseQuantity: 1, salePriceGuarani: 65000, isDefault: true, sortOrder: 10
    }]
  };
}

async function createSupplier(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/suppliers', headers: await authorizationHeader('admin'), payload });
}
