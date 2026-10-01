# Roles y permisos

LCM-009: ADMIN, MANAGER y PURCHASING tienen `inventory.movements.read` e `inventory.costs.read`; WAREHOUSE solo lectura de movimientos. CASHIER conserva `inventory.read`, pero no consulta ledger ni costos. LOGISTICS y DRIVER no acceden. API lista/detalle omite `costGuarani` sin permiso. No hay endpoints de creación, edición ni eliminación de movimientos, ni ajustes manuales.

La fuente de verdad ejecutable es `ROLE_PERMISSIONS` en `@lcm/contracts`. Los roles son fijos.

- `ADMIN`: todos los permisos, incluida la administración de usuarios.
- `MANAGER`: lectura, creación y edición de categorías, productos, proveedores y compras; puede confirmar/cancelar compras y administrar precios de venta; dashboard y lectura de clientes, inventario, ventas, camiones, viajes, combustible y reportes; incluye costos y márgenes.
- `CASHIER`: lectura de categorías, productos, proveedores, stock, clientes, creación/modificación de clientes, creación de ventas, ventas propias o autorizadas y caja.
- `PURCHASING`: lectura, creación, edición y confirmación de compras; categorías, productos, proveedores, costos e inventario. No puede cancelar compras ni modificar precios de venta.
- `WAREHOUSE`: lectura de categorías, productos, proveedores, inventario, recepciones, movimientos, ajustes autorizados y cargas pendientes.
- `LOGISTICS`: lectura general de productos; camiones, choferes, viajes, cargas, combustible y entregas.
- `DRIVER`: únicamente viajes propios, carga asignada, inicio/llegada, combustible autorizado y entrega/evidencia.

Categorías usa `categories.read`, `categories.create`, `categories.update` y `categories.disable`. Solo `ADMIN` puede desactivar; `LOGISTICS` y `DRIVER` no acceden.

Productos usa `products.read`, `products.create`, `products.update`, `products.disable` y `products.prices.manage`. `ADMIN` posee todos; `MANAGER` crea, edita y administra precios; `PURCHASING` crea y edita sin cambiar precios; `CASHIER`, `WAREHOUSE` y `LOGISTICS` tienen lectura; `DRIVER` no accede al CRUD general. Solo `ADMIN` activa o desactiva productos.

Proveedores usa `suppliers.read`, `suppliers.create`, `suppliers.update` y `suppliers.disable`. `ADMIN` posee todos; `MANAGER` y `PURCHASING` crean y editan; `CASHIER` y `WAREHOUSE` tienen lectura; `LOGISTICS` y `DRIVER` no acceden. Solo `ADMIN` activa o desactiva proveedores.

Compras usa `purchases.read`, `purchases.create`, `purchases.update`, `purchases.confirm`, `purchases.cancel` y `purchases.costs.read`. `ADMIN` y `MANAGER` poseen todos; `PURCHASING` crea, edita, confirma y ve costos sin cancelar; `WAREHOUSE` solo lee y el backend omite costos; los demás roles no acceden.

La API aplica `requirePermission`; ocultar opciones en Angular es solamente una mejora de experiencia.

Recepciones usa `receipts.read/create/update/confirm/cancel`; lotes usa `lots.read` y `lots.costs.read`. `ADMIN` y `MANAGER` poseen todos. `PURCHASING` consulta recepciones, lotes y costos. `WAREHOUSE` gestiona borradores, confirma/cancela borradores y consulta lotes, pero la API omite costos. Los demás roles no acceden.
