# Dominios previstos

- Auth
- Users
- Products
- Categories
- Suppliers
- Purchases
- Inventory
- Customers
- Sales
- Cash
- Trucks
- Drivers
- Trips
- Fuel
- Reports

LCM-001 solo prepara la estructura; no implementa lógica de estos dominios.

## Inventory ledger (LCM-009)

`InventoryMovement` es la fuente histórica de verdad e inmutable. `InventoryBalance` es una proyección operativa reconstruible mediante SUM(quantityDeltaInternal) por producto. Solo `InventoryService` prepara los movimientos y ordena cambios de la proyección a sus adaptadores de persistencia.

Confirmar una recepción crea, en una transacción, sus lotes, un movimiento PURCHASE_RECEIPT por línea y los incrementos de saldo. Cada movimiento conserva lote, producto, compra, recepción/línea, costo directo, fecha y autor. El costo se toma del lote; las correcciones requerirán futuros movimientos compensatorios. No existe stock manual en Product.

Los comandos explícitos de mantenimiento están descritos en [INVENTORY.md](INVENTORY.md). No se ejecutan al iniciar. No hay ajustes manuales, consumo de lotes, FIFO ni stock reservado.

## Stock queries (LCM-010)

El stock operativo proviene exclusivamente de `InventoryBalance.onHandInternal`; el ledger continúa siendo la fuente histórica. El estado es derivado: `NOT_TRACKED` cuando el producto no controla stock, `OUT_OF_STOCK` para saldo menor o igual a cero, `LOW_STOCK` para saldo positivo menor o igual al mínimo y `OK` por encima del mínimo.

La ausencia de balance equivale a cero para un producto controlado y no es inconsistencia. Los saldos negativos se muestran y se reportan en la verificación. La disponibilidad actual equivale al saldo disponible; cuando existan reservas será `onHand - reserved`. Las consultas no mutan stock; el costeo FIFO se describe en LCM-013.

## Customers (LCM-011)

`Customer` representa una persona o empresa, con nombre visible centralizado, documento/RUC opcionales, contacto, dirección principal, estado lógico y auditoría. La combinación tipo/número de documento y el RUC son únicos cuando existen. No se elimina físicamente ni contiene saldo, deuda o límite de crédito.

Una venta futura podrá operar sin cliente como consumidor final. Cuando tenga cliente, guardará un snapshot mínimo con nombre visible, tipo/número de documento y RUC; la dirección de entrega también será snapshot de la venta y no dependerá permanentemente de la dirección principal.

## Sales and POS (LCM-012)

`Sale` conserva borradores editables y ventas confirmadas/anuladas, número único, snapshots de cliente/producto/presentación, precio unitario vigente al agregar la línea y totales enteros calculados por backend. La ausencia de cliente representa Consumidor Final. Entrega y forma de pago son metadatos; esta tarea no crea movimientos de caja, deuda ni cuenta corriente.

Confirmar descuenta stock mediante movimientos inmutables `SALE`; anular genera `SALE_VOID` compensatorio. Las líneas del mismo producto se agregan antes de validar saldo y la venta cambia de estado en la misma transacción DynamoDB que el ledger. Productos sin control de stock no generan movimiento. LCM-013 completa el estado de costeo, COGS y rentabilidad.

## FIFO costing (LCM-013)

`SaleLotAllocation` es el histórico inmutable del consumo FIFO y `LotCostBalance` su proyección operacional por lote. FIFO trabaja exclusivamente en cantidades base internas y consume por `PurchaseLot.receivedAt ASC`, con `lotNumber` como desempate. `PurchaseLot` continúa inmutable.

El costo directo (Direct COGS) usa solamente `PurchaseLot.directPurchaseCostGuarani`. El costo proporcional, la distribución de descuento y el margen se calculan con aritmética `BigInt`, preservando cada guaraní; el margen se persiste en basis points. Ingreso neto de mercadería excluye el flete cobrado. Los costos adicionales y flete general de compra todavía no se distribuyen, por lo que no existe landed cost.

Una anulación marca allocations como `REVERSED` y restituye `LotCostBalance`, sin borrar el histórico. El ledger global de inventario y FIFO siguen siendo responsabilidades separadas y su coincidencia se verifica explícitamente.

## Categories

LCM-004 administra categorías ordenables con nombre y slug únicos, descripción opcional, estado activo/inactivo y auditoría básica. La asociación con productos se implementará posteriormente.

## Products

`Product` pertenece a una categoría activa y mantiene código estable, unidad base, escala de cantidad, stock mínimo configurado y estado lógico. Las unidades fijas iniciales son `UNIT`, `BAG`, `M3`, `KG` y `LITER`; pueden ampliarse desde el contrato central sin crear un catálogo separado.

`ProductPresentation` representa una forma comercial de venta con conversión a la unidad base, SKU y código de barras opcionales, precio actual en guaraníes, orden, estado y una única presentación activa predeterminada. Productos activos siempre conservan al menos una presentación activa.

Las cantidades persistidas son enteros escalados: `internalQuantity = displayQuantity × quantityScale`. Por ejemplo, con escala 1000, `0,5 m³` se guarda como `500`. El dinero también se persiste como entero. No se guarda costo de compra en producto: el costo futuro pertenecerá al lote de recepción.

`baseUnit`, `quantityScale` y `code` son inmutables después de crear el producto. Una presentación usada en ventas futuras no podrá cambiar retroactivamente su conversión; las ventas guardarán snapshots de presentación y precio para preservar el histórico. Productos y presentaciones con movimientos históricos nunca se eliminarán físicamente.

## Suppliers

`Supplier` conserva razón social, nombre comercial, RUC opcional, contacto, dirección, observaciones, estado lógico y auditoría. El RUC se normaliza y, cuando existe, es único. Los proveedores se desactivan sin borrarse; aquellos con compras históricas nunca se eliminarán y los inactivos no podrán seleccionarse para nuevas compras cuando se implemente LCM-007.

## Purchases

`Purchase` representa un documento comercial con estados `DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED` y `CANCELLED`; LCM-007 solo genera borradores, confirmaciones y cancelaciones. `PurchaseItem` guarda cantidad de presentaciones, cantidad base interna, precio unitario entero y subtotal calculado por backend.

Al confirmar se guardan `SupplierSnapshot`, `ProductSnapshot` y `PresentationSnapshot`, además de totales y auditoría definitiva. Una compra `CONFIRMED` no equivale a mercadería recibida: no crea stock, recepción, lote ni `InventoryMovement`. La entrada física comenzará en LCM-008.

## Purchase receiving and lots

`PurchaseReceipt` conserva la cabecera auditable de una recepción física y admite `DRAFT`, `CONFIRMED` y `CANCELLED`. Sus `PurchaseReceiptLine` siempre referencian un `PurchaseItem`; solo al confirmar incrementan los acumuladores recibidos y cambian la compra a `PARTIALLY_RECEIVED` o `RECEIVED`.

Cada línea confirmada crea un `PurchaseLot` histórico e inmutable con snapshots, cantidad interna y costo directo. La última recepción absorbe el remanente de guaraníes para que la suma coincida exactamente con el subtotal del ítem. Descuentos y costos adicionales no se distribuyen todavía. LCM-008 no introduce `product.stock` ni `InventoryMovement`.
