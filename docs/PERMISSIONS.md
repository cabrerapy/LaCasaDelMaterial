# Roles y permisos

La fuente de verdad ejecutable es `ROLE_PERMISSIONS` en `@lcm/contracts`. Los roles son fijos.

- `ADMIN`: todos los permisos, incluida la administración de usuarios.
- `MANAGER`: dashboard y lectura de productos, clientes, proveedores, compras, inventario, ventas, camiones, viajes, combustible y reportes; incluye costos y márgenes.
- `CASHIER`: productos, stock, clientes, creación/modificación de clientes, creación de ventas, ventas propias o autorizadas y caja.
- `PURCHASING`: productos, proveedores, creación/modificación de proveedores, compras, costos e inventario.
- `WAREHOUSE`: productos, inventario, recepciones, movimientos, ajustes autorizados y cargas pendientes.
- `LOGISTICS`: camiones, choferes, viajes, cargas, combustible y entregas.
- `DRIVER`: únicamente viajes propios, carga asignada, inicio/llegada, combustible autorizado y entrega/evidencia.

La API aplica `requirePermission`; ocultar opciones en Angular es solamente una mejora de experiencia.
