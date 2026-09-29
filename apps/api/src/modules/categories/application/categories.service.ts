import { randomUUID } from 'node:crypto';
import type {
  CategoriesPageResponse,
  CategoryStatus,
  CreateCategoryRequest,
  ProductCategoryResponse,
  UpdateCategoryRequest
} from '@lcm/contracts';
import type { CategoryListOptions, CategoryRepository } from '../domain/category.repository.js';
import { CategoryUniquenessError } from '../domain/category.repository.js';
import type { ProductCategory } from '../domain/product-category.js';
import { CategoryApplicationError } from './category-application-error.js';

export class CategoriesService {
  constructor(private readonly categories: CategoryRepository) {}

  async list(options: CategoryListOptions): Promise<CategoriesPageResponse> {
    const page = await this.categories.list({
      ...options,
      ...(options.search ? { search: normalizeName(options.search) } : {})
    });
    return {
      items: page.items.map(toResponse),
      ...(page.nextToken ? { nextToken: page.nextToken } : {})
    };
  }

  async getById(id: string): Promise<ProductCategoryResponse> {
    return toResponse(await this.requireCategory(id));
  }

  async create(input: CreateCategoryRequest, actorId: string): Promise<ProductCategoryResponse> {
    const name = cleanName(input.name);
    const slug = createSlug(name);
    await this.ensureUniqueSlug(slug);
    const now = new Date().toISOString();
    const category: ProductCategory = {
      id: randomUUID(),
      name,
      normalizedName: normalizeName(name),
      slug,
      ...descriptionProperty(input.description),
      status: 'ACTIVE',
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId
    };
    try {
      await this.categories.create(category);
    } catch (error: unknown) {
      this.rethrowUniqueness(error);
    }
    return toResponse(category);
  }

  async update(
    id: string,
    input: UpdateCategoryRequest,
    actorId: string
  ): Promise<ProductCategoryResponse> {
    const current = await this.requireCategory(id);
    const name = input.name ? cleanName(input.name) : current.name;
    const slug = input.name ? createSlug(name) : current.slug;
    if (slug !== current.slug) await this.ensureUniqueSlug(slug, current.id);
    const base = input.description !== undefined ? withoutDescription(current) : current;
    const updated: ProductCategory = {
      ...base,
      name,
      normalizedName: normalizeName(name),
      slug,
      ...(input.description !== undefined
        ? descriptionProperty(input.description)
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };
    try {
      await this.categories.update(updated, current.slug);
    } catch (error: unknown) {
      this.rethrowUniqueness(error);
    }
    return toResponse(updated);
  }

  async updateStatus(
    id: string,
    status: CategoryStatus,
    actorId: string
  ): Promise<ProductCategoryResponse> {
    const current = await this.requireCategory(id);
    if (current.status === status) return toResponse(current);
    const updated: ProductCategory = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };
    await this.categories.update(updated, current.slug);
    return toResponse(updated);
  }

  private async requireCategory(id: string): Promise<ProductCategory> {
    const category = await this.categories.findById(id);
    if (!category) throw new CategoryApplicationError('Categoría no encontrada', 404);
    return category;
  }

  private async ensureUniqueSlug(slug: string, currentId?: string): Promise<void> {
    const existing = await this.categories.findBySlug(slug);
    if (existing && existing.id !== currentId) {
      throw new CategoryApplicationError('La categoría ya existe', 409);
    }
  }

  private rethrowUniqueness(error: unknown): never {
    if (error instanceof CategoryUniquenessError) {
      throw new CategoryApplicationError('La categoría ya existe', 409);
    }
    throw error;
  }
}

export function createSlug(name: string): string {
  return normalizeName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}
function cleanName(value: string): string { return value.trim().replace(/\s+/g, ' '); }
function descriptionProperty(value: string | undefined): { description?: string } {
  const description = value?.trim();
  return description ? { description } : {};
}
function withoutDescription(category: ProductCategory): Omit<ProductCategory, 'description'> {
  const { description: _description, ...remaining } = category;
  void _description;
  return remaining;
}
function toResponse(category: ProductCategory): ProductCategoryResponse {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    ...(category.description ? { description: category.description } : {}),
    status: category.status,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}
