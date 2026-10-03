# Roles y permisos

LCM-022: `reports.read` habilita el hub y cada reporte exige además su permiso específico (`reports.sales/payments/transfers/margin/cash/purchases/inventory/inventory_movements/trips/deliveries/fuel.read`). `reports.export` es adicional para CSV. ADMIN y MANAGER acceden a todos; CASHIER a ventas, cobros, transferencias y caja; PURCHASING a compras e inventario; WAREHOUSE a inventario, movimientos, viajes y entregas; LOGISTICS a viajes, entregas y combustible. DRIVER no accede al módulo general. Costos continúan protegidos por los permisos de dominio y se omiten en backend.

LCM-021: `dashboard.read` permite solicitar el resumen, pero cada bloque se filtra nuevamente con sus permisos de dominio. Costos FIFO requieren `sales.costs.read`; costos de compras requieren `purchases.costs.read`; costos de combustible requieren `fuel.costs.read`. DRIVER recibe solo viajes, entregas y combustible propios, sin ventas, cobros, caja ni costos.

LCM-020: `deliveries.read/create/confirm/void` controla comprobantes de entrega y `delivery_evidence.read/create` sus evidencias. ADMIN, MANAGER y LOGISTICS poseen todos; DRIVER lee, crea y confirma únicamente para su propio Trip, sin anular; WAREHOUSE tiene solo lectura. CASHIER puede leer el resultado logístico desde una venta autorizada. La pertenencia del DRIVER se valida en backend mediante `Driver.userId`.

LCM-019: `fuel.read/create/void/costs.read` separa operación y datos económicos. ADMIN, MANAGER y LOGISTICS poseen todos; DRIVER lee y crea únicamente en sus viajes, pero no recibe precio ni costo. El chofer puede introducir el precio durante el alta porque `fuel.costs.read` controla lectura posterior, no captura operativa. WAREHOUSE, CASHIER y PURCHASING no acceden.

LCM-018: `trip_loads.read/create/update/confirm/cancel` controla la carga. ADMIN, MANAGER y LOGISTICS poseen todos; WAREHOUSE puede leer, crear, editar y confirmar; DRIVER solo lee la carga de su propio viaje. CASHIER y PURCHASING no acceden.

LCM-017: `trips.read/create/update/ready/start/deliver/cancel` controla el ciclo operativo. ADMIN, MANAGER y LOGISTICS poseen todos; WAREHOUSE solo lectura. DRIVER lee, inicia y entrega únicamente viajes cuyo Driver está vinculado a su User. CASHIER y PURCHASING no acceden.

LCM-016: `drivers.read/create/update/status.manage` protege el maestro de choferes. ADMIN, MANAGER y LOGISTICS administran; WAREHOUSE solo consulta. CASHIER, PURCHASING y DRIVER no acceden al CRUD general. La cuenta asociada no concede permisos de administración.

LCM-015: `trucks.read/create/update/status.manage` protege el maestro de vehículos. ADMIN, MANAGER y LOGISTICS poseen administración completa; WAREHOUSE solo lectura. CASHIER, PURCHASING y DRIVER no acceden al CRUD general. La disponibilidad futura se deriva del estado, no de un permiso ni campo booleano adicional.

LCM-014: `cash.read/open/close/manual_in/manual_out/audit` separa consulta, operación y supervisión. ADMIN posee todos; MANAGER puede auditar y realizar movimientos manuales; CASHIER consulta y abre/cierra solamente su propia caja. Sin `cash.audit`, la API impide consultar o cerrar sesiones ajenas. Confirmar o anular ventas exige una caja abierta del actor además de los permisos de ventas.

LCM-013: `sales.costs.read` protege COGS y detalle de lotes FIFO; `sales.margins.read` protege ingreso neto, utilidad y margen. ADMIN posee ambos y puede reintentar costeo; MANAGER posee ambos. CASHIER conserva importes comerciales, pero la API omite costos, allocations, utilidad y margen. PURCHASING, WAREHOUSE, LOGISTICS y DRIVER no reciben rentabilidad de ventas.

LCM-012: ADMIN y MANAGER leen todas las ventas, crean/editan/confirman, anulan y aplican descuentos. CASHIER crea, edita y confirma, pero solo consulta ventas propias/autorizadas, no aplica descuentos ni anula. Los endpoints aplican `sales.read/create/update/confirm/void/discount`, `sales.own.read` y `sales.authorized.read`; la UI no reemplaza la autorización del backend.

LCM-011: ADMIN y MANAGER administran clientes y estado; CASHIER consulta, crea y actualiza durante el flujo comercial, pero no activa/desactiva. PURCHASING, WAREHOUSE, LOGISTICS y DRIVER no acceden al CRUD general. Se aplican `customers.read/create/update/disable` desde la matriz central.

LCM-010: ADMIN, MANAGER, PURCHASING, WAREHOUSE, CASHIER y LOGISTICS consultan stock con `inventory.read`; DRIVER no accede. Solo los roles con `inventory.movements.read` reciben historial reciente y solo `inventory.costs.read` habilita sus costos históricos. CASHIER y LOGISTICS consultan disponibilidad sin ledger ni costos. Las consultas de stock no permiten mutaciones.

LCM-009: ADMIN, MANAGER y PURCHASING tienen `inventory.movements.read` e `inventory.costs.read`; WAREHOUSE solo lectura de movimientos. API lista/detalle omite `costGuarani` sin permiso. No hay endpoints de creación, edición ni eliminación de movimientos, ni ajustes manuales.

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
