export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'la-casa-del-material-api';
  readonly version: string;
  readonly environment: string;
}
export * from './inventory.js';

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
  'purchases.read', 'purchases.create', 'purchases.update', 'purchases.confirm',
  'purchases.cancel', 'purchases.costs.read',
  'receipts.read', 'receipts.create', 'receipts.update', 'receipts.confirm', 'receipts.cancel',
  'lots.read', 'lots.costs.read',
  'inventory.read', 'inventory.receive', 'inventory.movements.read', 'inventory.adjust',
  'inventory.costs.read',
  'customers.read', 'customers.create', 'customers.update', 'customers.disable',
  'sales.read', 'sales.create', 'sales.update', 'sales.confirm', 'sales.void', 'sales.discount',
  'sales.own.read', 'sales.authorized.read',
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
    'customers.read', 'customers.create', 'customers.update', 'customers.disable',
    'suppliers.read', 'suppliers.create', 'suppliers.update',
    'purchases.read', 'purchases.create', 'purchases.update', 'purchases.confirm',
    'purchases.cancel', 'purchases.costs.read',
    'receipts.read', 'receipts.create', 'receipts.update', 'receipts.confirm', 'receipts.cancel',
    'lots.read', 'lots.costs.read',
    'inventory.read', 'inventory.movements.read', 'sales.read', 'sales.create', 'sales.update', 'sales.confirm', 'sales.void', 'sales.discount', 'sales.authorized.read',
    'inventory.costs.read',
    'trucks.read', 'trips.access', 'trips.read', 'fuel.access', 'fuel.read', 'reports.read'
  ],
  CASHIER: [
    'dashboard.read', 'categories.read', 'products.read', 'suppliers.read', 'inventory.read', 'customers.read',
    'customers.create', 'customers.update', 'sales.create', 'sales.update', 'sales.confirm', 'sales.own.read',
    'sales.authorized.read', 'cash.read'
  ],
  PURCHASING: [
    'dashboard.read', 'categories.read', 'categories.create', 'categories.update',
    'products.read', 'products.create', 'products.update', 'suppliers.read', 'suppliers.create',
    'suppliers.update', 'purchases.read', 'purchases.create', 'purchases.update',
    'purchases.confirm', 'purchases.costs.read',
    'receipts.read', 'lots.read', 'lots.costs.read',
    'products.costs.read', 'inventory.read', 'inventory.movements.read', 'inventory.costs.read'
  ],
  WAREHOUSE: [
    'dashboard.read', 'categories.read', 'products.read', 'suppliers.read', 'purchases.read',
    'receipts.read', 'receipts.create', 'receipts.update', 'receipts.confirm', 'receipts.cancel', 'lots.read',
    'inventory.read', 'inventory.receive',
    'inventory.movements.read', 'inventory.adjust', 'loads.pending.read'
  ],
  LOGISTICS: [
    'dashboard.read', 'products.read', 'inventory.read', 'trucks.read', 'trucks.manage', 'drivers.read', 'trips.read',
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

export const PURCHASE_STATUSES = [
  'DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface SupplierSnapshot {
  readonly businessName: string;
  readonly tradeName?: string;
  readonly taxId?: string;
}
export interface ProductSnapshot {
  readonly code: string;
  readonly name: string;
  readonly baseUnit: BaseUnit;
  readonly quantityScale: number;
}
export interface PresentationSnapshot {
  readonly name: string;
  readonly sku?: string;
  readonly baseQuantityInternal: number;
}
export interface PurchaseItemResponse {
  readonly id: string;
  readonly productId: string;
  readonly presentationId: string;
  readonly productSnapshot: ProductSnapshot;
  readonly presentationSnapshot: PresentationSnapshot;
  readonly quantity: number;
  readonly quantityBaseInternal: number;
  readonly orderedQuantityBaseInternal: number;
  readonly receivedQuantityBaseInternal: number;
  readonly allocatedReceivedCostGuarani?: number;
  readonly unitPurchasePriceGuarani?: number;
  readonly lineSubtotalGuarani?: number;
  readonly notes?: string;
  readonly sortOrder: number;
}
export interface PurchaseResponse {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly supplierId: string;
  readonly supplierSnapshot: SupplierSnapshot;
  readonly supplierInvoiceNumber?: string;
  readonly purchaseDate: string;
  readonly expectedDeliveryDate?: string;
  readonly status: PurchaseStatus;
  readonly notes?: string;
  readonly cancellationReason?: string;
  readonly items: readonly PurchaseItemResponse[];
  readonly subtotalGuarani?: number;
  readonly discountGuarani?: number;
  readonly additionalCostsGuarani?: number;
  readonly totalGuarani?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly cancelledAt?: string;
  readonly confirmedBy?: string;
  readonly cancelledBy?: string;
}
export interface PurchasesPageResponse {
  readonly items: readonly PurchaseResponse[];
  readonly nextToken?: string;
}
export interface PurchaseItemInput {
  readonly productId: string;
  readonly presentationId: string;
  readonly quantity: number;
  readonly unitPurchasePriceGuarani: number;
  readonly notes?: string;
  readonly sortOrder?: number;
}
export interface CreatePurchaseRequest {
  readonly supplierId: string;
  readonly supplierInvoiceNumber?: string;
  readonly purchaseDate: string;
  readonly expectedDeliveryDate?: string;
  readonly discountGuarani?: number;
  readonly additionalCostsGuarani?: number;
  readonly notes?: string;
  readonly items: readonly PurchaseItemInput[];
}
export interface UpdatePurchaseRequest {
  readonly supplierId?: string;
  readonly supplierInvoiceNumber?: string;
  readonly purchaseDate?: string;
  readonly expectedDeliveryDate?: string | null;
  readonly discountGuarani?: number;
  readonly additionalCostsGuarani?: number;
  readonly notes?: string;
  readonly items?: readonly PurchaseItemInput[];
}
export interface CancelPurchaseRequest { readonly reason?: string; }

export const PURCHASE_RECEIPT_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type PurchaseReceiptStatus = (typeof PURCHASE_RECEIPT_STATUSES)[number];
export interface PurchaseReceiptLineInput {
  readonly purchaseItemId: string;
  readonly receivedQuantity: string;
  readonly notes?: string;
}
export interface CreatePurchaseReceiptRequest {
  readonly purchaseId: string;
  readonly receiptDate: string;
  readonly deliveryDocumentNumber?: string;
  readonly notes?: string;
  readonly lines: readonly PurchaseReceiptLineInput[];
}
export type UpdatePurchaseReceiptRequest = Omit<Partial<CreatePurchaseReceiptRequest>, 'purchaseId'>;
export interface PurchaseReceiptLineResponse {
  readonly id: string; readonly receiptId: string; readonly purchaseId: string; readonly purchaseItemId: string;
  readonly productId: string; readonly presentationId: string; readonly receivedQuantityBaseInternal: number;
  readonly receivedQuantity: string; readonly directPurchaseCostGuarani?: number;
  readonly productSnapshot: ProductSnapshot; readonly presentationSnapshot: PresentationSnapshot; readonly notes?: string;
}
export interface PurchaseReceiptResponse {
  readonly id: string; readonly receiptNumber: string; readonly purchaseId: string; readonly purchaseNumber: string;
  readonly supplierId: string; readonly supplierSnapshot: SupplierSnapshot; readonly receiptDate: string;
  readonly status: PurchaseReceiptStatus; readonly deliveryDocumentNumber?: string; readonly notes?: string;
  readonly lines: readonly PurchaseReceiptLineResponse[]; readonly createdAt: string; readonly updatedAt: string;
  readonly confirmedAt?: string; readonly cancelledAt?: string; readonly createdBy: string; readonly updatedBy: string;
  readonly confirmedBy?: string; readonly cancelledBy?: string;
}
export interface PurchaseReceiptsPageResponse { readonly items: readonly PurchaseReceiptResponse[]; readonly nextToken?: string; }
export interface PurchaseItemReceivingStatus {
  readonly purchaseItemId: string; readonly productId: string; readonly presentationId: string;
  readonly productSnapshot: ProductSnapshot; readonly presentationSnapshot: PresentationSnapshot;
  readonly orderedQuantityBaseInternal: number; readonly receivedQuantityBaseInternal: number;
  readonly pendingQuantityBaseInternal: number; readonly orderedQuantity: string; readonly receivedQuantity: string;
  readonly pendingQuantity: string;
}
export interface PurchaseReceivingStatusResponse {
  readonly purchaseId: string; readonly purchaseNumber: string; readonly status: PurchaseStatus;
  readonly items: readonly PurchaseItemReceivingStatus[];
}
export interface PurchaseLotResponse {
  readonly id: string; readonly lotNumber: string; readonly purchaseId: string; readonly purchaseNumber: string;
  readonly purchaseItemId: string; readonly receiptId: string; readonly receiptNumber: string; readonly receiptLineId: string;
  readonly supplierId: string; readonly productId: string; readonly presentationId: string;
  readonly receivedQuantityBaseInternal: number; readonly receivedQuantity: string;
  readonly directPurchaseCostGuarani?: number; readonly productSnapshot: ProductSnapshot;
  readonly presentationSnapshot: PresentationSnapshot; readonly supplierSnapshot: SupplierSnapshot;
  readonly receivedAt: string; readonly createdAt: string; readonly createdBy: string;
}
export interface PurchaseLotsPageResponse { readonly items: readonly PurchaseLotResponse[]; readonly nextToken?: string; }
export * from './stock.js';
export * from './customers.js';
export * from './sales.js';
