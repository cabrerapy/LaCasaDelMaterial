# Patrones de acceso conocidos

Antes de definir tablas o índices DynamoDB se detallarán volumen, orden, filtros y consistencia de cada patrón.

- Obtener usuario por ID para resolver una sesión autenticada.
- Obtener usuario por username para login local.
- Obtener usuario por email para unicidad futura.
- Listar usuarios en páginas limitadas con cursor opaco.
- Obtener categoría por ID mediante `CATEGORY#{id}`.
- Obtener categoría por slug mediante la reserva `SLUG#{slug}`.
- Listar categorías en páginas limitadas y filtrar por estado.
- Buscar categorías por nombre normalizado.
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

La tabla local de categorías usa una clave `pk`. Categorías y reservas únicas de slug conviven en la tabla; las transacciones evitan slugs duplicados. Listado, estado y búsqueda usan `Scan` limitado con cursor opaco por el volumen pequeño previsto. La interfaz de repositorio permite sustituirlo por índices cuando el volumen lo justifique.

La tabla local de productos usa `pk` y conserva productos, presentaciones y reservas únicas. Accesos directos: `PRODUCT#{id}`, `PRODUCT_CODE#{code}`, `PRESENTATION#{id}`, `SKU#{sku}` y `BARCODE#{barcode}`. El nombre normalizado también se reserva para evitar duplicados exactos. Creación y cambios de claves únicas usan transacciones condicionales, no secuencias de buscar y luego guardar.

Los productos por categoría, productos activos y la búsqueda parcial por código/nombre usan `Scan` paginado y limitado. La búsqueda por SKU o código de barras realiza primero un scan suplementario limitado de presentaciones y filtra los productos correspondientes. Las presentaciones por producto usan un scan limitado a 100 elementos; la API restringe a siete presentaciones por alta para mantener las transacciones dentro del límite de DynamoDB. Esta solución está acotada al volumen inicial de una PYME y podrá reemplazarse por índices cuando exista evidencia de volumen, sin incorporar un motor full-text.

La tabla local de proveedores usa `pk`. El proveedor se obtiene mediante `SUPPLIER#{id}` y el RUC opcional mediante la reserva `TAX_ID#{taxId}`. Altas y cambios de RUC usan escrituras transaccionales condicionales para garantizar unicidad concurrente. Listado, estado y búsqueda parcial por razón social, nombre comercial o RUC usan `Scan` limitado con cursor opaco por el volumen inicial previsto.
