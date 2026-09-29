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
  'products.read', 'products.create', 'products.update', 'products.costs.read', 'products.margins.read',
  'suppliers.read', 'suppliers.create', 'suppliers.update',
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
    'dashboard.read', 'products.read', 'products.costs.read', 'products.margins.read',
    'customers.read', 'suppliers.read', 'purchases.read', 'purchases.costs.read',
    'inventory.read', 'inventory.movements.read', 'sales.read', 'sales.authorized.read',
    'trucks.read', 'trips.access', 'trips.read', 'fuel.access', 'fuel.read', 'reports.read'
  ],
  CASHIER: [
    'dashboard.read', 'products.read', 'inventory.read', 'customers.read',
    'customers.create', 'customers.update', 'sales.create', 'sales.own.read',
    'sales.authorized.read', 'cash.read'
  ],
  PURCHASING: [
    'dashboard.read', 'products.read', 'suppliers.read', 'suppliers.create',
    'suppliers.update', 'purchases.read', 'purchases.create', 'purchases.costs.read',
    'products.costs.read', 'inventory.read'
  ],
  WAREHOUSE: [
    'dashboard.read', 'products.read', 'inventory.read', 'inventory.receive',
    'inventory.movements.read', 'inventory.adjust', 'loads.pending.read'
  ],
  LOGISTICS: [
    'dashboard.read', 'trucks.read', 'trucks.manage', 'drivers.read', 'trips.read',
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
