import type { Permission } from '@lcm/contracts';

export interface NavigationItem {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
  readonly requiredPermission: Permission;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: '▦', requiredPermission: 'dashboard.read' },
  { label: 'Punto de venta', route: '/pos', icon: '▦', requiredPermission: 'sales.create' },
  { label: 'Caja', route: '/cash', icon: '▣', requiredPermission: 'cash.read' },
  { label: 'Ventas', route: '/sales', icon: '◫', requiredPermission: 'sales.authorized.read' },
  { label: 'Compras', route: '/purchases', icon: '▣', requiredPermission: 'purchases.read' },
  { label: 'Recepciones', route: '/purchase-receipts', icon: '▤', requiredPermission: 'receipts.read' },
  { label: 'Lotes', route: '/lots', icon: '▧', requiredPermission: 'lots.read' },
  { label: 'Inventario · Stock', route: '/inventory', icon: '◈', requiredPermission: 'inventory.read' },
  { label: 'Inventario · Movimientos', route: '/inventory/movements', icon: '≡', requiredPermission: 'inventory.movements.read' },
  { label: 'Categorías', route: '/categories', icon: '◌', requiredPermission: 'categories.read' },
  { label: 'Productos', route: '/products', icon: '◇', requiredPermission: 'products.read' },
  { label: 'Clientes', route: '/customers', icon: '◎', requiredPermission: 'customers.read' },
  { label: 'Proveedores', route: '/suppliers', icon: '◉', requiredPermission: 'suppliers.read' },
  { label: 'Camiones', route: '/trucks', icon: '▰', requiredPermission: 'trucks.read' },
  { label: 'Viajes', route: '/trips', icon: '➜', requiredPermission: 'trips.access' },
  { label: 'Combustible', route: '/fuel', icon: '◐', requiredPermission: 'fuel.access' },
  { label: 'Reportes', route: '/reports', icon: '▥', requiredPermission: 'reports.read' },
  { label: 'Usuarios', route: '/users', icon: '♙', requiredPermission: 'users.read' }
];
