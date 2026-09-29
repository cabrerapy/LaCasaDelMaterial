import type { SupplierStatus } from '@lcm/contracts';

export interface Supplier {
  readonly id: string;
  readonly businessName: string;
  readonly normalizedBusinessName: string;
  readonly tradeName?: string;
  readonly normalizedTradeName?: string;
  readonly taxId?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly city?: string;
  readonly notes?: string;
  readonly status: SupplierStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}
