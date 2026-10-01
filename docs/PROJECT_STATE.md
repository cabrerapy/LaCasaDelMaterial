# Estado del proyecto

- Tarea actual: LCM-011 Customers
- Estado: IN_PROGRESS (validación Docker de tareas previas sigue pendiente por permisos del entorno).
- Funcionalidades implementadas: consultas paginadas de stock, estados derivados, faltante, resumen de productos activos, detalle con presentaciones/última recepción/movimientos recientes, búsqueda y filtros, disponibilidad reusable y pantalla responsive. Validación: 78 tests API, 56 web, integración real DynamoDB Local, lint y builds correctos.
- Decisiones importantes: InventoryBalance es la fuente operativa y InventoryMovement la histórica; balance ausente equivale a cero. Estado/shortage no se persisten. Sin valorización, reservas, ventas, FIFO ni consumo de lotes. Se preservaron cambios previos; no se creó commit ni push.
- Pendientes inmediatos: ejecutar `docker compose build` desde una terminal con acceso a Docker Desktop. No reiniciar DynamoDB Local en memoria si se desea conservar datos. Tras validar Docker, cerrar LCM-010 y continuar con LCM-011 Customers.
