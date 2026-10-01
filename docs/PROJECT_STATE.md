# Estado del proyecto

- Tarea actual: LCM-009 Inventory Ledger
- Estado: BLOCKED (implementación terminada; validación Docker Compose pendiente por permisos del entorno).
- Funcionalidades implementadas: ledger inmutable, integración transaccional con recepciones/lotes, saldos atómicos, idempotencia por origen, API de lectura, interfaz responsive, costos por permiso y comandos de backfill/rebuild/verify. Validación: 73 tests API, 52 web, integración real DynamoDB Local, flujo HTTP y conciliación sin inconsistencias; lint y builds correctos.
- Decisiones importantes: InventoryMovement es la fuente histórica; InventoryBalance es una proyección reconstruible. No hay stock manual, ajustes, ventas, consumo de lotes ni FIFO. Se preservaron los cambios previos; no se creó commit ni push.
- Pendientes inmediatos: ejecutar `docker compose build` desde una terminal del usuario con acceso a Docker Desktop y validar arranque de API/web sin recrear DynamoDB (usa -inMemory: reiniciarlo pierde datos). El entorno del agente devuelve Acceso denegado al leer configuración/preparar contexto. Tras validar Docker, cerrar LCM-009 y continuar con LCM-010 Stock Queries.
