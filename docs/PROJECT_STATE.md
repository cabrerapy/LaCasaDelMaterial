# Estado del proyecto

- Tarea actual: LCM-013 FIFO Costing
- Estado: BLOCKED (implementación terminada; build Angular y Docker Compose bloqueados por permisos del entorno).
- Funcionalidades implementadas: allocations FIFO, balances de costo por lote, Direct COGS por item/venta, utilidad, margen BPS, descuento distribuido, reversión al anular, reintento idempotente, backfill, rebuild, verify, permisos y UI de rentabilidad. Validación: lint completo, 83 tests API y 60 tests web correctos; builds contracts/API correctos.
- Decisiones importantes: FIFO usa cantidad base y `PurchaseLot.receivedAt`; `SaleLotAllocation` es histórico y `LotCostBalance` proyección. Solo se usa costo directo del lote; costos adicionales generales de compra no forman landed cost.
- Pendientes inmediatos: ejecutar build web/Docker y comandos de mantenimiento en una terminal con acceso completo; después continuar con LCM-014 Cash.
