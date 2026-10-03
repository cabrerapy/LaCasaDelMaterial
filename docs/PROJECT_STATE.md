# Estado del proyecto

- Tarea actual: LCM-021 Dashboard.
- Estado: PARTIAL (API, seguridad, agregaciones y UI implementadas; lint y tests API/web aprobados; build web, DynamoDB Local, E2E y revisión responsive permanecen bloqueados o pendientes).
- Funcionalidades implementadas: Dashboard por permisos; filtros Hoy/Ayer/7 días/Mes/Personalizado; ventas, cobros por medio, transferencias por referencia, caja, margen bruto FIFO, stock, compras, viajes, entregas, combustible, alertas, ventas recientes y vista operativa de DRIVER.
- Decisiones importantes: stack actualizado a Node.js 24 LTS, Angular 22.2 y TypeScript 6.0; transferencias son cobros pero no efectivo físico; margen bruto no es ganancia neta; campos financieros se filtran en backend; rango máximo de 90 días y paginación completa con guardia; no se inventó catálogo de cuentas receptoras inexistente.
- Pendientes inmediatos: crear índices por fecha para eliminar Scan heredado en Sales/Fuel, validar DynamoDB Local multipágina, ejecutar el build web fuera del bloqueo de acceso al sistema de archivos, ampliar E2E y revisar 360/390/768/1024/1440; después iniciar LCM-022 Reports.
