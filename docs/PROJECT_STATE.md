# Estado del proyecto

- Tarea actual: LCM-019 Fuel.
- Estado: BLOCKED (funcionalidad Fuel operativa y validaciones TypeScript/API completas; build/test Angular y Docker continúan bloqueados por permisos del entorno OneDrive; persiste el pendiente heredado de atomicidad Trip/TripLoad de LCM-018).
- Funcionalidades implementadas: transacciones inmutables de combustible, numeración anual, litros milli, costo exacto, validación de camión/viaje/chofer/combustible/odómetro, anulación, seguridad de costos, listados, resúmenes por viaje y camión, acceso DRIVER, API, DynamoDB y UI responsive integrada a Viajes.
- Decisiones importantes: combustible cargado es costo logístico interno y no equivale a flete ni consumo exacto; el rendimiento es aproximado; Fuel no actualiza odómetro maestro ni genera movimientos de caja, lotes o inventario; el precio capturado por DRIVER se oculta posteriormente sin `fuel.costs.read`.
- Pendientes inmediatos: completar pruebas frontend con el entorno desbloqueado, validar DynamoDB/Docker real y resolver la transacción conjunta de cancelación Trip/TripLoad heredada. No iniciar entrega/evidencia/GPS/mapas/reportes generales.
