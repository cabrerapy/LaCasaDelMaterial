# Estado del proyecto

- Tarea actual: LCM-022 Reports.
- Estado: PARTIAL (API, permisos, 12 reportes, CSV e interfaz implementados; lint, tests y DynamoDB Local aprobados; build, Docker, E2E y revisión visual externa pendientes).
- Funcionalidades implementadas: hub y reportes de ventas, cobros, transferencias, margen bruto, caja, compras, inventario actual, movimientos, stock bajo, viajes, entregas y combustible; fecha/hora, filtros, cursor, exportación CSV segura e impresión responsive.
- Decisiones importantes: Reports es read-only; transferencias son cobros pero no efectivo físico; margen bruto no es ganancia neta; FIFO incompleto queda pendiente; backend omite costos sin permiso; Sales y Fuel consultan GSIs temporales; no se inventó catálogo de cuentas receptoras.
- Pendientes inmediatos: ejecutar build y Docker fuera del bloqueo de acceso de esta sesión, agregar infraestructura/smoke E2E y revisar visualmente 360/390/430/768/1024/1440; luego iniciar LCM-023 AWS Deployment.
