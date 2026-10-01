# Estado del proyecto

- Tarea actual: LCM-012 Sales / POS
- Estado: BLOCKED (implementación terminada; validación Docker Compose pendiente por permisos del entorno).
- Funcionalidades implementadas: POS responsive, borrador/confirmación/anulación, consumidor final o snapshot de cliente, precios y cantidades exactas, descuentos autorizados, flete, entrega, metadatos de pago, historial, permisos y ledger `SALE`/`SALE_VOID` con control atómico de stock. Validación: 80 tests API, 60 web y lint correctos; build Angular y Docker bloqueados por acceso del entorno a rutas de OneDrive/Docker Desktop.
- Decisiones importantes: venta con máximo diez líneas embebidas, stock agregado por producto y condicionado dentro de la transición; productos sin control de stock no generan movimiento. Costeo `PENDING`/`NOT_APPLICABLE`; FIFO, COGS, utilidad, caja, deuda y cuenta corriente no implementados. No se creó commit ni push.
- Pendientes inmediatos: ejecutar `docker compose build` desde una terminal con acceso a Docker Desktop. Próxima tarea: LCM-013 FIFO Costing.
