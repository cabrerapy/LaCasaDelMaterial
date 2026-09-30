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
