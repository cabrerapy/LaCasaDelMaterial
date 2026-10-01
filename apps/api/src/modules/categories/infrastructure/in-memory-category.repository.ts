import type {
  CategoryListOptions,
  CategoryPage,
  CategoryRepository
} from '../domain/category.repository.js';
import { CategoryUniquenessError } from '../domain/category.repository.js';
import type { ProductCategory } from '../domain/product-category.js';

export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly categories = new Map<string, ProductCategory>();
  async findByIds(ids: readonly string[]) { return [...this.categories.values()].filter((item) => ids.includes(item.id)); }

  async findById(id: string): Promise<ProductCategory | null> {
    return this.categories.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<ProductCategory | null> {
    return [...this.categories.values()].find((category) => category.slug === slug) ?? null;
  }

  async list(options: CategoryListOptions): Promise<CategoryPage> {
    const start = options.nextToken ? Number(options.nextToken) : 0;
    const search = options.search?.toLowerCase();
    const filtered = [...this.categories.values()]
      .filter((category) => !options.status || category.status === options.status)
      .filter((category) => !search || category.normalizedName.includes(search))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    const items = filtered.slice(start, start + options.limit);
    const followingIndex = start + items.length;
    return {
      items,
      ...(followingIndex < filtered.length ? { nextToken: String(followingIndex) } : {})
    };
  }

  async create(category: ProductCategory): Promise<void> {
    if (await this.findBySlug(category.slug)) throw new CategoryUniquenessError();
    this.categories.set(category.id, category);
  }

  async update(category: ProductCategory, previousSlug: string): Promise<void> {
    const slugOwner = await this.findBySlug(category.slug);
    if (slugOwner && slugOwner.id !== category.id) throw new CategoryUniquenessError();
    if (!this.categories.has(category.id)) throw new Error('Category not found');
    void previousSlug;
    this.categories.set(category.id, category);
  }
}
