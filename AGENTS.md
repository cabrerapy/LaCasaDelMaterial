# La Casa del Material

Sistema de gestión para depósito y comercio de materiales de construcción.

## Stack y arquitectura

- Frontend: Angular 19 + TypeScript, standalone components.
- Backend: Node.js + TypeScript + Fastify.
- Persistencia: DynamoDB.
- Infraestructura futura: AWS CDK con TypeScript.
- Usar un monolito modular. No crear microservicios.
- Módulos previstos: auth, users, roles, products, categories, suppliers, purchases, inventory, customers, sales, cash, trucks, drivers, trips, fuel y reports.

## Código

- TypeScript strict; evitar `any`.
- Usar UUID, fechas ISO 8601 e importes en guaraníes como enteros. Nunca usar floating point para dinero.
- Validar toda entrada de la API. Mantener routes/controllers livianos y la lógica en servicios o casos de uso.
- Desacoplar persistencia y negocio; no acceder a DynamoDB desde componentes HTTP.
- Evitar dependencias, archivos gigantes, abstracciones prematuras y refactors fuera de alcance.
- No modificar módulos ajenos a la tarea.

## DynamoDB e inventario

- Diseñar DynamoDB según patrones de acceso; consultar `docs/ACCESS-PATTERNS.md` antes de crear índices o estructuras.
- Nunca modificar stock directamente. Todo cambio debe pasar por `InventoryService` y crear un `InventoryMovement` inmutable; `InventoryBalance` es su proyección operativa.
- Conservar costos, lotes históricos y autor. El consumo FIFO usa proyecciones y allocations; los ajustes manuales quedan pendientes de su tarea específica.
- Las asignaciones FIFO son automáticas, usan cantidades base internas y nunca seleccionan ni modifican manualmente el lote histórico consumido.

## Calidad y documentación

- Antes de terminar: ejecutar lint, tests relacionados y build; informar errores y archivos principales modificados.
- No duplicar documentación. Al completar una tarea importante, actualizar `docs/PROJECT_STATE.md` con solo: tarea actual, estado, funcionalidades implementadas, decisiones importantes y pendientes inmediatos.
