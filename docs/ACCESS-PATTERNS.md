# Patrones de acceso conocidos

## Ledger LCM-009

Tabla de inventario separada, clave `pk`: `MOVEMENT#{uuid}` para detalle; `MOVEMENT_NUMBER#{number}` para número único; `SOURCE#PURCHASE_RECEIPT#{receiptId}#{lineId}` para origen único; `BALANCE#{productId}` para saldo/versionado. Número MOV-año-UUID: no usa contador global.

Los GSIs MovementDateIndex (entityType), MovementProductIndex (productId), MovementLotIndex (lotId) y MovementTypeIndex (type) comparten orden `occurredAt#createdAt#id`. Query descendente limitada y paginada; filtros adicionales por origen, referencia y rangos. Búsqueda parcial acotada a cada página. Los índices son eventualmente consistentes; las lecturas por ID/origen/saldo son fuertes.

La confirmación usa una sola transacción entre compras e inventario (máximo 42 operaciones para cinco líneas). Agrupa productos repetidos y usa ADD atómico sobre cantidad/version. Las reservas de origen/número son condicionales. Las condiciones de versión de compra y recepción impiden confirmar datos obsoletos.

Las líneas usadas al confirmar se leen mediante Scan fuerte en páginas de 100 sobre la tabla local de compras, filtrando tipo e ID. Evita resultados obsoletos de GSI y mezcla de lotes/recepciones en el índice anterior. Esta solución prioriza consistencia para el volumen inicial; futuras claves de agregados permitirán Query fuerte sin scans.

Mantenimiento recorre páginas fuertes de 100, sin índices eventuales. Rebuild toma versión antes de recorrer el ledger y aplica CAS al final: si hubo entradas concurrentes reintenta, sin perder incrementos. Verify informa cambios concurrentes para repetir en reposo.

## Consultas de stock LCM-010

El listado pagina primero el catálogo con sus filtros existentes (estado, categoría y búsqueda por código/nombre/SKU/barcode). Por cada página obtiene balances y categorías mediante `BatchGet` fuerte, reintentando claves no procesadas, y presentaciones de los productos del conjunto en un recorrido acotado. Esto evita consultas individuales de saldo/categoría. La última actividad usa el índice `MovementProductIndex` con límite uno y concurrencia máxima de cinco; es el único enriquecimiento por producto y queda como candidato a snapshot denormalizado si el volumen lo exige.

Los filtros derivados `stockStatus` y `trackStock`, y el orden visual, se aplican dentro de la página del catálogo; por ello puede existir una página vacía con cursor siguiente. No se agregó un GSI para estados derivados. El resumen recorre productos activos en páginas de 100 y obtiene sus balances por lote. El detalle consulta un producto, su balance fuerte, presentaciones y hasta diez movimientos recientes por el índice de producto.

## Customers LCM-011

Tabla separada con `CUSTOMER#{id}` para detalle, `DOCUMENT#{type}#{normalizedNumber}` y `TAX_ID#{normalizedTaxId}` como reservas únicas. Altas y cambios de documento/RUC usan transacciones condicionales, incluyendo liberación de reservas anteriores.

El listado inicial usa Scan limitado y cursor opaco sobre la tabla exclusiva de clientes. Estado, tipo, ciudad y búsqueda por nombre visible, documento, RUC o teléfono se aplican como filtros acotados. No se agregan GSIs hasta que el volumen justifique índices concretos.

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

La tabla local de compras usa `PURCHASE#{id}` y reserva `PURCHASE_NUMBER#{number}`. `PurchaseDateIndex` ordena compras por fecha, `SupplierDateIndex` atiende proveedor/fecha, `StatusDateIndex` atiende estado/fecha y `PurchaseItemsIndex` obtiene las líneas de una compra. Todos los listados usan `Query` paginado, descendente y limitado; la búsqueda por número, factura o proveedor se aplica como filtro acotado sobre esos índices.

Creación, edición, confirmación y cancelación reemplazan cabecera y líneas mediante transacciones condicionales. El número legible usa `CMP-{año}-{8 caracteres hexadecimales}`: evita un contador global y conserva unicidad mediante reserva condicional. Las facturas de proveedor se buscan dentro del listado indexado y no se consideran únicas.

Recepciones y lotes comparten la tabla de compras para confirmar atómicamente recepción, acumuladores, compra y lotes. Los índices de fecha, proveedor, estado y compra se reutilizan; `RelationIndex` obtiene líneas/lotes por recepción y `ProductDateIndex` obtiene lotes por producto. Los listados son paginados. Las claves directas y reservas únicas son `RECEIPT#{id}`, `RECEIPT_NUMBER#{number}`, `LOT#{id}` y `LOT_NUMBER#{number}`. Cada recepción admite cinco líneas para respetar el límite transaccional de DynamoDB; solo se reescriben los ítems recibidos.
