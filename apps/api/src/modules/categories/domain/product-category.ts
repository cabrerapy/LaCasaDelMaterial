import type { CategoryStatus } from '@lcm/contracts';

export interface ProductCategory {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: CategoryStatus;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}
