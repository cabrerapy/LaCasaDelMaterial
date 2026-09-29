import { randomUUID } from 'node:crypto';
import type {
  CreateProductPresentationRequest,
  CreateProductRequest,
  ProductPresentationResponse,
  ProductResponse,
  ProductsPageResponse,
  ProductStatus,
  UpdateProductPresentationRequest,
  UpdateProductRequest
} from '@lcm/contracts';
import type { CategoryRepository } from '../../categories/domain/category.repository.js';
import type { ProductListOptions, ProductRepository } from '../domain/product.repository.js';
import { ProductUniquenessError } from '../domain/product.repository.js';
import {
  toDisplayQuantity,
  toInternalQuantity,
  type Product,
  type ProductPresentation
} from '../domain/product.js';
import { ProductApplicationError } from './product-application-error.js';

export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository
  ) {}

  async list(options: ProductListOptions): Promise<ProductsPageResponse> {
    const page = await this.products.list({
      ...options,
      ...(options.search ? { search: normalizeName(options.search) } : {})
    });
    const items = await Promise.all(page.items.map((product) => this.toResponse(product)));
    return { items, ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }

  async getById(id: string): Promise<ProductResponse> {
    return this.toResponse(await this.requireProduct(id));
  }

  async listPresentations(productId: string): Promise<readonly ProductPresentationResponse[]> {
    const product = await this.requireProduct(productId);
    return (await this.products.listPresentations(productId)).map((item) =>
      toPresentationResponse(item, product.quantityScale));
  }

  async create(input: CreateProductRequest, actorId: string): Promise<ProductResponse> {
    await this.requireActiveCategory(input.categoryId);
    const code = normalizeCode(input.code, 'Código');
    const name = cleanRequired(input.name, 'Nombre');
    const quantityScale = input.quantityScale;
    const now = new Date().toISOString();
    const productId = randomUUID();
    const product: Product = {
      id: productId,
      code,
      name,
      normalizedName: normalizeName(name),
      ...optionalDescription(input.description),
      categoryId: input.categoryId,
      baseUnit: input.baseUnit,
      quantityScale,
      minStockInternal: convertQuantity(input.minStock, quantityScale),
      trackStock: input.trackStock ?? true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId
    };
    const presentations = createPresentations(productId, input.presentations, quantityScale, actorId, now);
    try {
      await this.products.create(product, presentations);
    } catch (error: unknown) {
      this.rethrowUniqueness(error);
    }
    return this.toResponse(product, presentations);
  }

  async update(id: string, input: UpdateProductRequest, actorId: string): Promise<ProductResponse> {
    const current = await this.requireProduct(id);
    if (input.categoryId) await this.requireActiveCategory(input.categoryId);
    const descriptionBase = input.description !== undefined ? withoutDescription(current) : current;
    const updated: Product = {
      ...descriptionBase,
      ...(input.name !== undefined ? {
        name: cleanRequired(input.name, 'Nombre'),
        normalizedName: normalizeName(input.name)
      } : {}),
      ...(input.description !== undefined ? optionalDescription(input.description) : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.minStock !== undefined
        ? { minStockInternal: convertQuantity(input.minStock, current.quantityScale) }
        : {}),
      ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };
    try { await this.products.updateProduct(updated, current.normalizedName); }
    catch (error: unknown) { this.rethrowUniqueness(error); }
    return this.toResponse(updated);
  }

  async updateStatus(id: string, status: ProductStatus, actorId: string): Promise<ProductResponse> {
    const current = await this.requireProduct(id);
    if (status === 'ACTIVE') this.assertCommerciallyUsable(await this.products.listPresentations(id));
    const updated: Product = {
      ...current, status, updatedAt: new Date().toISOString(), updatedBy: actorId
    };
    await this.products.updateProduct(updated, current.normalizedName);
    return this.toResponse(updated);
  }

  async createPresentation(
    productId: string,
    input: CreateProductPresentationRequest,
    actorId: string
  ): Promise<ProductPresentationResponse> {
    const product = await this.requireProduct(productId);
    const current = await this.products.listPresentations(productId);
    const now = new Date().toISOString();
    const shouldDefault = current.filter((item) => item.status === 'ACTIVE').length === 0 || input.isDefault === true;
    const previousDefault = shouldDefault ? current.find((item) => item.status === 'ACTIVE' && item.isDefault) : undefined;
    const presentation = createPresentation(productId, input, product.quantityScale, actorId, now, shouldDefault);
    try {
      await this.products.createPresentation(
        presentation,
        previousDefault ? { ...previousDefault, isDefault: false, updatedAt: now, updatedBy: actorId } : undefined
      );
    } catch (error: unknown) { this.rethrowUniqueness(error); }
    return toPresentationResponse(presentation, product.quantityScale);
  }

  async updatePresentation(
    productId: string,
    presentationId: string,
    input: UpdateProductPresentationRequest,
    actorId: string,
    canManagePrices: boolean
  ): Promise<ProductPresentationResponse> {
    const product = await this.requireProduct(productId);
    const current = await this.requirePresentation(productId, presentationId);
    if (input.salePriceGuarani !== undefined && input.salePriceGuarani !== current.salePriceGuarani && !canManagePrices) {
      throw new ProductApplicationError('No posee permiso para modificar precios', 403);
    }
    const now = new Date().toISOString();
    const updated: ProductPresentation = {
      ...withoutOptionalPresentationFields(current),
      name: input.name !== undefined ? cleanRequired(input.name, 'Nombre') : current.name,
      ...optionalText('sku', input.sku === undefined ? current.sku : input.sku, normalizeSku),
      ...optionalText('barcode', input.barcode === undefined ? current.barcode : input.barcode),
      baseQuantityInternal: input.baseQuantity !== undefined
        ? positiveQuantity(input.baseQuantity, product.quantityScale)
        : current.baseQuantityInternal,
      salePriceGuarani: input.salePriceGuarani ?? current.salePriceGuarani,
      isDefault: input.isDefault ?? current.isDefault,
      sortOrder: input.sortOrder ?? current.sortOrder,
      updatedAt: now,
      updatedBy: actorId
    };
    if (updated.status !== 'ACTIVE' && updated.isDefault) {
      throw new ProductApplicationError('Una presentación inactiva no puede ser predeterminada', 409);
    }
    const presentations = await this.products.listPresentations(productId);
    const previousDefault = updated.isDefault
      ? presentations.find((item) => item.status === 'ACTIVE' && item.isDefault && item.id !== updated.id)
      : undefined;
    if (current.isDefault && input.isDefault === false && !previousDefault) {
      throw new ProductApplicationError('Debe existir una presentación predeterminada activa', 409);
    }
    try {
      await this.products.updatePresentation(
        updated,
        current,
        previousDefault ? { ...previousDefault, isDefault: false, updatedAt: now, updatedBy: actorId } : undefined
      );
    } catch (error: unknown) { this.rethrowUniqueness(error); }
    return toPresentationResponse(updated, product.quantityScale);
  }

  async updatePresentationStatus(
    productId: string,
    presentationId: string,
    status: ProductStatus,
    actorId: string
  ): Promise<ProductPresentationResponse> {
    const product = await this.requireProduct(productId);
    const current = await this.requirePresentation(productId, presentationId);
    const all = await this.products.listPresentations(productId);
    const activeOthers = all.filter((item) => item.id !== presentationId && item.status === 'ACTIVE');
    if (status === 'INACTIVE' && product.status === 'ACTIVE' && activeOthers.length === 0) {
      throw new ProductApplicationError('No se puede desactivar la última presentación activa', 409);
    }
    const now = new Date().toISOString();
    let replacement: ProductPresentation | undefined;
    let isDefault = current.isDefault;
    if (status === 'INACTIVE' && current.isDefault) {
      const next = activeOthers[0];
      if (next) replacement = { ...next, isDefault: true, updatedAt: now, updatedBy: actorId };
      isDefault = false;
    } else if (status === 'ACTIVE' && !all.some((item) => item.status === 'ACTIVE' && item.isDefault)) {
      isDefault = true;
    }
    const updated: ProductPresentation = {
      ...current, status, isDefault, updatedAt: now, updatedBy: actorId
    };
    await this.products.updatePresentation(updated, current, replacement);
    return toPresentationResponse(updated, product.quantityScale);
  }

  private async requireProduct(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) throw new ProductApplicationError('Producto no encontrado', 404);
    return product;
  }
  private async requirePresentation(productId: string, id: string): Promise<ProductPresentation> {
    const item = await this.products.findPresentationById(productId, id);
    if (!item) throw new ProductApplicationError('Presentación no encontrada', 404);
    return item;
  }
  private async requireActiveCategory(id: string): Promise<void> {
    const category = await this.categories.findById(id);
    if (!category) throw new ProductApplicationError('Categoría no encontrada', 400);
    if (category.status !== 'ACTIVE') throw new ProductApplicationError('La categoría debe estar activa', 409);
  }
  private assertCommerciallyUsable(items: readonly ProductPresentation[]): void {
    const active = items.filter((item) => item.status === 'ACTIVE');
    if (active.length === 0 || active.filter((item) => item.isDefault).length !== 1) {
      throw new ProductApplicationError('El producto necesita una presentación activa predeterminada', 409);
    }
  }
  private async toResponse(product: Product, loaded?: readonly ProductPresentation[]): Promise<ProductResponse> {
    const category = await this.categories.findById(product.categoryId);
    if (!category) throw new ProductApplicationError('Categoría no encontrada', 500);
    const presentations = loaded ?? await this.products.listPresentations(product.id);
    return {
      id: product.id, code: product.code, name: product.name,
      ...(product.description ? { description: product.description } : {}),
      category: { id: category.id, name: category.name },
      baseUnit: product.baseUnit, quantityScale: product.quantityScale,
      minStock: toDisplayQuantity(product.minStockInternal, product.quantityScale),
      trackStock: product.trackStock, status: product.status,
      presentations: presentations.map((item) => toPresentationResponse(item, product.quantityScale)),
      createdAt: product.createdAt, updatedAt: product.updatedAt
    };
  }
  private rethrowUniqueness(error: unknown): never {
    if (error instanceof ProductUniquenessError) {
      const labels = { code: 'El código', name: 'El nombre', sku: 'El SKU', barcode: 'El código de barras' };
      throw new ProductApplicationError(`${labels[error.field]} ya existe`, 409);
    }
    throw error;
  }
}

function createPresentations(
  productId: string,
  inputs: readonly CreateProductPresentationRequest[],
  scale: number,
  actorId: string,
  now: string
): readonly ProductPresentation[] {
  if (inputs.length === 0) throw new ProductApplicationError('Agregue al menos una presentación', 400);
  const defaults = inputs.filter((item) => item.isDefault).length;
  if (defaults > 1) throw new ProductApplicationError('Solo una presentación puede ser predeterminada', 400);
  return inputs.map((input, index) => createPresentation(
    productId, input, scale, actorId, now, defaults === 0 ? index === 0 : input.isDefault === true
  ));
}
function createPresentation(
  productId: string,
  input: CreateProductPresentationRequest,
  scale: number,
  actorId: string,
  now: string,
  isDefault: boolean
): ProductPresentation {
  return {
    id: randomUUID(), productId, name: cleanRequired(input.name, 'Nombre'),
    ...optionalText('sku', input.sku, normalizeSku),
    ...optionalText('barcode', input.barcode),
    baseQuantityInternal: positiveQuantity(input.baseQuantity, scale),
    salePriceGuarani: input.salePriceGuarani, isDefault, status: 'ACTIVE',
    sortOrder: input.sortOrder ?? 0, createdAt: now, updatedAt: now,
    createdBy: actorId, updatedBy: actorId
  };
}
function positiveQuantity(value: number, scale: number): number {
  const result = convertQuantity(value, scale);
  if (result <= 0) throw new ProductApplicationError('La cantidad equivalente debe ser mayor que cero', 400);
  return result;
}
function convertQuantity(value: number, scale: number): number {
  try { return toInternalQuantity(value, scale); }
  catch { throw new ProductApplicationError('La cantidad no puede representarse con la escala elegida', 400); }
}
function toPresentationResponse(item: ProductPresentation, scale: number): ProductPresentationResponse {
  return {
    id: item.id, productId: item.productId, name: item.name,
    ...(item.sku ? { sku: item.sku } : {}), ...(item.barcode ? { barcode: item.barcode } : {}),
    baseQuantity: toDisplayQuantity(item.baseQuantityInternal, scale),
    salePriceGuarani: item.salePriceGuarani, isDefault: item.isDefault,
    status: item.status, sortOrder: item.sortOrder,
    createdAt: item.createdAt, updatedAt: item.updatedAt
  };
}
function normalizeCode(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new ProductApplicationError(`${label} solo admite letras, números, guion y guion bajo`, 400);
  }
  return normalized;
}
function normalizeSku(value: string): string { return normalizeCode(value, 'SKU'); }
function normalizeName(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function cleanRequired(value: string, field: string): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) throw new ProductApplicationError(`${field} es obligatorio`, 400);
  return clean;
}
function optionalDescription(value: string | undefined): { description?: string } {
  const clean = value?.trim(); return clean ? { description: clean } : {};
}
function optionalText<K extends 'sku' | 'barcode'>(
  key: K,
  value: string | null | undefined,
  transform: (value: string) => string = (item) => item.trim()
): { sku?: string; barcode?: string } {
  const clean = value?.trim(); return clean ? { [key]: transform(clean) } : {};
}
function withoutDescription(product: Product): Omit<Product, 'description'> {
  const { description: _description, ...rest } = product; void _description; return rest;
}
function withoutOptionalPresentationFields(
  item: ProductPresentation
): Omit<ProductPresentation, 'sku' | 'barcode'> {
  const { sku: _sku, barcode: _barcode, ...rest } = item; void _sku; void _barcode; return rest;
}
