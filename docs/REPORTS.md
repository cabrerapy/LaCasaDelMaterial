# Definiciones de reportes

Todos los períodos usan `America/Asuncion`, aceptan fecha y hora ISO 8601 y calculan el resumen sobre todo el conjunto filtrado, no solo la página visible. Los importes son guaraníes enteros.

| Reporte | Fuente y fecha | Inclusión y resumen | Campos sensibles |
| --- | --- | --- | --- |
| Ventas | Sale; `confirmedAt`/`createdAt` | CONFIRMED por defecto; cantidad, bruto, descuentos, neto y ticket | Sin costos |
| Cobros | CashMovement; `occurredAt` | SALE_PAYMENT; total, cantidad y medio | Referencia receptora enmascarada |
| Transferencias | CashMovement + Sale; `occurredAt` | SALE_PAYMENT/TRANSFER; total y desglose por referencia | Solo etiqueta y últimos 4 caracteres |
| Margen bruto | Sale/SaleItem; `confirmedAt` | Costeados separados de pendientes; ingreso, FIFO y margen bruto | Requiere permiso de margen/costos |
| Caja | CashSession/CashMovement; `occurredAt` | Solo efectivo físico y manuales; transferencias excluidas | Sesiones ajenas requieren alcance autorizado |
| Compras | Purchase; `purchaseDate` | Excluye DRAFT/CANCELLED del resumen efectivo | Importes solo con `purchases.costs.read` |
| Inventario actual | Product + InventoryBalance; actual | Conteo por estado derivado | No muestra valoración no demostrada |
| Movimientos | InventoryMovement; `occurredAt` | Entradas/salidas y referencias | Costo solo con `inventory.costs.read` |
| Stock bajo | Product + InventoryBalance; actual | OUT_OF_STOCK antes de LOW_STOCK | Sin valoración |
| Viajes | Trip; `startedAt`/`scheduledDate` | Conteo por estado y distancia válida | Sin costos financieros |
| Entregas | DeliveryReceipt; `deliveredAt`/`createdAt` | Completas, parciales, fallidas y anuladas | Sin evidencias binarias |
| Combustible | FuelTransaction; `occurredAt` | POSTED en resumen; cargas y litros | Costos solo con `fuel.costs.read` |

La exportación CSV exige `reports.export`, usa UTF-8 con BOM, separador `;`, respeta campos autorizados y neutraliza valores que comienzan con `=`, `+`, `-` o `@`. El máximo predeterminado es 50.000 filas; superar el límite produce un error explícito.
