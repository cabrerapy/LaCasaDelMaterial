# Patrones de acceso conocidos

Antes de definir tablas o índices DynamoDB se detallarán volumen, orden, filtros y consistencia de cada patrón.

- Obtener usuario por ID para resolver una sesión autenticada.
- Obtener usuario por username para login local.
- Obtener usuario por email para unicidad futura.
- Listar usuarios en páginas limitadas con cursor opaco.
- Obtener producto por ID.
- Buscar o listar productos.
- Consultar stock de un producto.
- Consultar lotes disponibles.
- Consultar compras por fecha.
- Consultar ventas por fecha.
- Consultar viajes por camión.
- Consultar viajes por fecha.
- Consultar movimientos de inventario de un producto.

La tabla local de usuarios usa la clave primaria `id`, `UsernameIndex` y `EmailIndex`. El listado usa un `Scan` limitado y paginado porque la tabla es exclusiva y pequeña en esta etapa; no se realizan scans ilimitados. La tabla general del sistema todavía no está definida.
