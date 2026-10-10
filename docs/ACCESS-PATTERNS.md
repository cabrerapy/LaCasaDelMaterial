# Patrones de acceso conocidos

## Identidad Cognito LCM-023

Un pool por entorno. La tabla Users conserva usuarios por UUID y añade reservas sin username/email: `COGNITO_SUB#{sub}` y `COGNITO_USER#{userId}`. Vinculación explícita mediante una transacción: comprobar usuario existente y escribir ambas reservas condicionalmente; acepta repetir el mismo par pero impide cambiarlo o asignar otro sub al usuario. No hay índice adicional ni búsqueda por correo. Resolver usa dos Get fuertes para comprobar vínculo bidireccional y luego Get fuerte del usuario para rol/estado actual. Listado Users filtra registros sin username y conserva cursor, incluso páginas vacías. No hay API de vinculación, migración automática ni operación de borrado/reasignación; la administración Cognito y compensación siguen pendientes.

## Reports LCM-022

Los reportes temporales consultan páginas por cursor y calculan el resumen recorriendo todas las páginas del rango. Sales usa `SaleDateIndex` (`datePk=SALE`, `dateSk=saleDate#createdAt#id`), Fuel usa `FuelDateIndex` (`datePk=FUEL`, `dateSk=occurredAt#createdAt#id`), CashMovement usa `CashMovementDateIndex` y Trips usa `TripDateIndex`; reemplazan los `Scan` operativos anteriores por `Query`. Purchases, InventoryMovement y Deliveries reutilizan sus índices temporales existentes. Los filtros secundarios se aplican sobre el conjunto temporal acotado. Inventario actual y stock bajo consultan catálogo paginado más balances por lote, porque representan estado presente y no histórico.

Los registros Sales/Fuel/CashMovement/Trip escritos desde LCM-022 proyectan las nuevas claves. Una base persistente creada antes de LCM-022 requiere backfill de esas proyecciones antes de consultar datos históricos; DynamoDB Local en memoria se recrea con los índices y no conserva registros antiguos.

## Dashboard LCM-021

`GET /api/dashboard/summary` recorre todas las páginas del rango solicitado, con guardia máxima de 100 páginas, y agrega Sales, CashMovement, Products/InventoryBalance, Purchases, Trips, Deliveries y Fuel en backend. El rango máximo es 90 días y el período efectivo usa `America/Asuncion`. Los índices existentes de compras, viajes y entregas se reutilizan. Antes de considerar producción completa deben sustituirse los `Scan` heredados de los repositorios DynamoDB de Sales y Fuel por índices de fecha; el Dashboard no oculta ni trunca esa limitación.

## Deliveries LCM-020

La tabla de entregas usa claves directas `DELIVERY#{id}`, `NUMBER#{deliveryNumber}`, `ACTIVE_TRIP#{tripId}` y `EVIDENCE#{id}`. `RelationIndex` resuelve entrega por Trip y evidencias por Delivery; `SaleIndex` lista entregas por venta; `DateIndex` mantiene el listado cronológico y `StatusIndex` filtra por estado. Los flujos operativos usan `Query`, no `Scan`.

Confirmar ejecuta una sola `TransactWrite` entre Delivery, Trip, Truck, locks activos y `SaleItemDeliveryBalance` de la tabla de cargas. Libera la cantidad cargada de `assigned` e incrementa la entregada con condiciones que impiden superar vendido. VOID revierte la cantidad entregada en una transacción y no reabre el Trip. Los archivos viven en `.data/delivery-evidence`; DynamoDB conserva solo metadata y storage keys generadas por backend.

## Fuel LCM-019

La tabla exclusiva usa `FUEL#{id}` para detalle, `NUMBER#{fuelNumber}` como reserva única y `COUNTER#{year}` para generar `COM-{año}-{secuencia}` atómicamente. Los registros conservan campos denormalizados de camión, viaje y chofer para lectura operativa.

El listado inicial usa `Scan` paginado y limitado sobre la tabla exclusiva, con filtros acotados por camión, viaje, chofer, estado, fecha y estación, y ordena cada página por `occurredAt DESC`. Los resúmenes recorren páginas y suman exclusivamente registros `POSTED`. No se agregan GSIs hasta justificar volumen; candidatos futuros son índices por viaje, camión/fecha, chofer/fecha, fecha y estado.

## Truck loads LCM-018

La tabla exclusiva de cargas usa `LOAD#{tripId}` para garantizar una sola carga activa por viaje y `BALANCE#{saleId}#{saleItemId}` para la proyección fuerte de cantidad asignada. Confirmar escribe la carga y aplica `ADD` condicional a cada balance dentro de una única `TransactWrite`; la condición impide que dos viajes concurrentes superen la cantidad vendida. Cancelar conserva el histórico y resta las asignaciones en la misma transacción de carga.

Las consultas operativas leen BALANCE con consistencia fuerte: pendiente = vendido - asignado - entregado. Mantenimiento recorre cargas y entregas paginadas: asignado = cargas CONFIRMED menos cantidades cargadas liberadas por entregas CONFIRMED/VOIDED; entregado = cantidades entregadas de recibos CONFIRMED. VOID conserva la liberación original de carga. Rebuild conserva sold e historia, captura versiones antes de leer fuentes y reemplaza balances en una única transacción CAS; confirmación/cancelación de carga y confirmación/anulación de entrega incrementan versión. Rechaza históricos incompletos, balances faltantes sin cantidad vendida confiable y más de 100 saldos; no divide silenciosamente una reconstrucción atómica. Requiere desplegar el versionado en todos los escritores y mantenimiento en reposo; no modifica inventario. No se agregan índices.

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

## Sales LCM-012

Tabla separada con `SALE#{id}` y reserva condicional `SALE_NUMBER#{number}`. La venta contiene hasta diez líneas embebidas para que detalle, edición y transición de estado sean una lectura/escritura consistente. El listado inicial usa Scan limitado y cursor opaco, con filtros acotados por fecha, estado, cliente, usuario y forma de pago; número y cliente forman el texto normalizado de búsqueda.

Confirmación y anulación reemplazan la venta mediante condición sobre `updatedAt` y anexan en la misma `TransactWrite` los movimientos y actualizaciones de saldo. Los descuentos de stock se agrupan por producto y condicionan `onHandInternal >= cantidad`; esto impide sobreventa concurrente. El máximo de diez líneas mantiene la transacción bajo el límite de DynamoDB. Los índices por fecha/estado/cliente/usuario se añadirán cuando el volumen real lo justifique.

## FIFO Costing LCM-013

Tabla de costeo separada: `LOT_BALANCE#{lotId}` obtiene la proyección fuerte por lote y `ALLOCATION#{saleItemId}#{lotId}` garantiza idempotencia. `OpenLotsIndex` es sparse: partición `OPENLOT#PRODUCT#{productId}` y orden `receivedAt#lotNumber`; los lotes agotados dejan de proyectar esas claves. `SaleAllocationsIndex` usa `saleId` y `saleItemId#receivedAt#lotNumber` para detalle y reversión.

Cada allocation y actualización del balance se escriben en una transacción condicional por versión y cantidad restante. Las allocations por venta/item/lote y activas por lote se derivan de los registros de allocation; ventas confirmadas `PENDING` se recorren paginadas y se ordenan por confirmación/número para backfill. Rebuild usa `PurchaseLot - allocations ACTIVE`; verify compara lotes, items, venta e `InventoryBalance` sin corregir silenciosamente.

## Cash LCM-014

Tabla separada con `SESSION#{id}` para sesiones, `OPEN_USER#{userId}` como bloqueo fuerte de una caja abierta por usuario, `MOVEMENT#{id}` para movimientos y `SOURCE#{type}#{sourceId}` para idempotencia. `SESSION_NUMBER#{number}` reserva el número legible. `SessionMovementsIndex` obtiene los movimientos de una sesión por fecha y `SessionDateIndex` soporta el historial cronológico.

Apertura y cierre usan transacciones condicionales. Cada movimiento actualiza atómicamente la proyección `expectedCashGuarani`; el cierre compara `updatedAt`, por lo que no puede competir silenciosamente con un cobro o movimiento manual. Los movimientos de venta se anexan a la misma `TransactWrite` de venta, inventario y FIFO. El listado administrativo inicial conserva paginación limitada y filtros acotados; podrá migrar completamente al índice de fecha cuando el volumen lo justifique.

## Trucks LCM-015

Tabla exclusiva con `TRUCK#{id}` para detalle fuerte, `PLATE#{normalizedPlate}` y `INTERNAL_CODE#{normalizedCode}` como reservas únicas. Alta y cambio de código interno usan transacciones condicionales, por lo que dos solicitudes concurrentes no pueden reservar el mismo valor. La chapa queda inmutable.

El listado inicial usa `Scan` limitado con cursor opaco sobre la tabla pequeña y exclusiva, filtrando estado, tipo, combustible y texto normalizado de chapa/código/marca/modelo. No se crean GSIs antes de observar volumen real; estados y tipo podrán indexarse sin cambiar el contrato del repositorio.

## Drivers LCM-016

Tabla exclusiva con `DRIVER#{id}` para detalle fuerte y reservas condicionales `USER#{userId}`, `DOCUMENT#{normalizedDocument}` y `LICENSE#{normalizedLicense}`. Altas y cambios actualizan registro y reservas en una sola transacción. El listado usa Scan limitado y paginado con filtros de estado, vencimiento y búsqueda normalizada; no requiere índices para el volumen inicial.

## Trips LCM-017

Tabla exclusiva con `TRIP#{id}`, reserva `NUMBER#{tripNumber}` y locks `ACTIVE_TRUCK#{truckId}` / `ACTIVE_DRIVER#{driverId}`. READY adquiere ambos locks en una transacción; cancelación o entrega los libera. La entrega actualiza viaje y odómetro monotónico del camión en una escritura transaccional entre tablas. Listado paginado filtra fecha, estado, camión, chofer y venta.

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
