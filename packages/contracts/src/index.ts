export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'la-casa-del-material-api';
  readonly version: string;
  readonly environment: string;
}

export const USER_ROLES = [
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'PURCHASING',
  'WAREHOUSE',
  'LOGISTICS',
  'DRIVER'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerencia',
  CASHIER: 'Facturador',
  PURCHASING: 'Compras',
  WAREHOUSE: 'Depósito',
  LOGISTICS: 'Logística',
  DRIVER: 'Chofer'
};

export const PERMISSIONS = [
  'dashboard.read',
  'users.read', 'users.create', 'users.update', 'users.disable',
  'categories.read', 'categories.create', 'categories.update', 'categories.disable',
  'products.read', 'products.create', 'products.update', 'products.disable',
  'products.prices.manage', 'products.costs.read', 'products.margins.read',
  'suppliers.read', 'suppliers.create', 'suppliers.update', 'suppliers.disable',
  'purchases.read', 'purchases.create', 'purchases.costs.read',
  'inventory.read', 'inventory.receive', 'inventory.movements.read', 'inventory.adjust',
  'customers.read', 'customers.create', 'customers.update',
  'sales.read', 'sales.create', 'sales.own.read', 'sales.authorized.read',
  'cash.read',
  'trucks.read', 'trucks.manage',
  'drivers.read',
  'trips.access', 'trips.read', 'trips.manage', 'trips.own.read', 'trips.start', 'trips.arrival',
  'loads.read', 'loads.pending.read', 'loads.assigned.read',
  'fuel.access', 'fuel.read', 'fuel.create', 'fuel.authorized.create',
  'deliveries.read', 'deliveries.register', 'deliveries.evidence.create',
  'reports.read'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  MANAGER: [
    'dashboard.read', 'categories.read', 'categories.create', 'categories.update',
    'products.read', 'products.create', 'products.update', 'products.prices.manage',
    'products.costs.read', 'products.margins.read',
    'customers.read', 'suppliers.read', 'suppliers.create', 'suppliers.update',
    'purchases.read', 'purchases.costs.read',
    'inventory.read', 'inventory.movements.read', 'sales.read', 'sales.authorized.read',
    'trucks.read', 'trips.access', 'trips.read', 'fuel.access', 'fuel.read', 'reports.read'
  ],
  CASHIER: [
    'dashboard.read', 'categories.read', 'products.read', 'suppliers.read', 'inventory.read', 'customers.read',
    'customers.create', 'customers.update', 'sales.create', 'sales.own.read',
    'sales.authorized.read', 'cash.read'
  ],
  PURCHASING: [
    'dashboard.read', 'categories.read', 'categories.create', 'categories.update',
    'products.read', 'products.create', 'products.update', 'suppliers.read', 'suppliers.create',
    'suppliers.update', 'purchases.read', 'purchases.create', 'purchases.costs.read',
    'products.costs.read', 'inventory.read'
  ],
  WAREHOUSE: [
    'dashboard.read', 'categories.read', 'products.read', 'suppliers.read', 'inventory.read', 'inventory.receive',
    'inventory.movements.read', 'inventory.adjust', 'loads.pending.read'
  ],
  LOGISTICS: [
    'dashboard.read', 'products.read', 'trucks.read', 'trucks.manage', 'drivers.read', 'trips.read',
    'trips.access', 'trips.manage', 'loads.read', 'fuel.access', 'fuel.read', 'fuel.create', 'deliveries.read'
  ],
  DRIVER: [
    'dashboard.read', 'trips.access', 'trips.own.read', 'trips.start', 'trips.arrival',
    'loads.assigned.read', 'fuel.access', 'fuel.authorized.create', 'deliveries.register',
    'deliveries.evidence.create'
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const USER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface AuthenticatedUserResponse {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly user: AuthenticatedUserResponse;
}

export interface UserResponse extends AuthenticatedUserResponse {
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UsersPageResponse {
  readonly items: readonly UserResponse[];
  readonly nextToken?: string;
}

export interface CreateUserRequest {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
}

export interface UpdateUserRequest {
  readonly name?: string;
  readonly email?: string;
  readonly role?: UserRole;
}

export interface UpdateUserStatusRequest {
  readonly status: UserStatus;
}

export const CATEGORY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export interface ProductCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: CategoryStatus;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CategoriesPageResponse {
  readonly items: readonly ProductCategoryResponse[];
  readonly nextToken?: string;
}

export interface CreateCategoryRequest {
  readonly name: string;
  readonly description?: string;
  readonly sortOrder?: number;
}

export interface UpdateCategoryRequest {
  readonly name?: string;
  readonly description?: string;
  readonly sortOrder?: number;
}

export interface UpdateCategoryStatusRequest {
  readonly status: CategoryStatus;
}

export const BASE_UNITS = ['UNIT', 'BAG', 'M3', 'KG', 'LITER'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];
export const BASE_UNIT_LABELS: Readonly<Record<BaseUnit, string>> = {
  UNIT: 'Unidad', BAG: 'Bolsa', M3: 'm³', KG: 'kg', LITER: 'Litro'
};

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type PresentationStatus = ProductStatus;

export interface ProductCategorySummary {
  readonly id: string;
  readonly name: string;
}

export interface ProductPresentationResponse {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly baseQuantity: number;
  readonly salePriceGuarani: number;
  readonly isDefault: boolean;
  readonly status: PresentationStatus;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductResponse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly category: ProductCategorySummary;
  readonly baseUnit: BaseUnit;
  readonly quantityScale: number;
  readonly minStock: number;
  readonly trackStock: boolean;
  readonly status: ProductStatus;
  readonly presentations: readonly ProductPresentationResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductsPageResponse {
  readonly items: readonly ProductResponse[];
  readonly nextToken?: string;
}

export interface CreateProductPresentationRequest {
  readonly name: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly baseQuantity: number;
  readonly salePriceGuarani: number;
  readonly isDefault?: boolean;
  readonly sortOrder?: number;
}

export interface CreateProductRequest {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly categoryId: string;
  readonly baseUnit: BaseUnit;
  readonly quantityScale: number;
  readonly minStock: number;
  readonly trackStock?: boolean;
  readonly presentations: readonly CreateProductPresentationRequest[];
}

export interface UpdateProductRequest {
  readonly name?: string;
  readonly description?: string;
  readonly categoryId?: string;
  readonly minStock?: number;
  readonly trackStock?: boolean;
}

export interface UpdateProductStatusRequest { readonly status: ProductStatus; }

export interface UpdateProductPresentationRequest {
  readonly name?: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly baseQuantity?: number;
  readonly salePriceGuarani?: number;
  readonly isDefault?: boolean;
  readonly sortOrder?: number;
}

export interface UpdatePresentationStatusRequest { readonly status: PresentationStatus; }

export const SUPPLIER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export interface SupplierResponse {
  readonly id: string;
  readonly businessName: string;
  readonly tradeName?: string;
  readonly taxId?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly city?: string;
  readonly notes?: string;
  readonly status: SupplierStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SuppliersPageResponse {
  readonly items: readonly SupplierResponse[];
  readonly nextToken?: string;
}

export interface CreateSupplierRequest {
  readonly businessName: string;
  readonly tradeName?: string;
  readonly taxId?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly city?: string;
  readonly notes?: string;
}

export type UpdateSupplierRequest = Partial<CreateSupplierRequest>;
export interface UpdateSupplierStatusRequest { readonly status: SupplierStatus; }
