# Estado del proyecto

- Tarea actual: LCM-011 Customers
- Estado: BLOCKED (implementación terminada; validación Docker Compose pendiente por permisos del entorno).
- Funcionalidades implementadas: clientes Persona/Empresa, nombre visible, documentos y RUC únicos, búsqueda/filtros/paginación, edición, estado lógico, auditoría, permisos y UI responsive con formulario dinámico. Validación: 79 tests API, 60 web, flujo real DynamoDB Local, lint y builds correctos.
- Decisiones importantes: tipo inmutable, documento y RUC opcionales, baja lógica y dirección principal editable. Ventas podrán usar consumidor final o snapshot de cliente; no hay ventas, crédito, deuda ni cuenta corriente. No se creó commit ni push.
- Pendientes inmediatos: ejecutar `docker compose build` desde una terminal con acceso a Docker Desktop. Tras validar Docker, cerrar LCM-011 y continuar con LCM-012 Sales.
