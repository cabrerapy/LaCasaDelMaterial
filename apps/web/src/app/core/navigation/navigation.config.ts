import type { Permission } from '@lcm/contracts';

export interface NavigationItem {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
  readonly requiredPermission: Permission;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: '▦', requiredPermission: 'dashboard.read' },
  { label: 'Ventas', route: '/sales', icon: '◫', requiredPermission: 'sales.authorized.read' },
  { label: 'Compras', route: '/purchases', icon: '▣', requiredPermission: 'purchases.read' },
  { label: 'Inventario', route: '/inventory', icon: '◈', requiredPermission: 'inventory.read' },
  { label: 'Productos', route: '/products', icon: '◇', requiredPermission: 'products.read' },
  { label: 'Clientes', route: '/customers', icon: '◎', requiredPermission: 'customers.read' },
  { label: 'Proveedores', route: '/suppliers', icon: '◉', requiredPermission: 'suppliers.read' },
  { label: 'Camiones', route: '/trucks', icon: '▰', requiredPermission: 'trucks.read' },
  { label: 'Viajes', route: '/trips', icon: '➜', requiredPermission: 'trips.access' },
  { label: 'Combustible', route: '/fuel', icon: '◐', requiredPermission: 'fuel.access' },
  { label: 'Reportes', route: '/reports', icon: '▥', requiredPermission: 'reports.read' },
  { label: 'Usuarios', route: '/users', icon: '♙', requiredPermission: 'users.read' }
];
