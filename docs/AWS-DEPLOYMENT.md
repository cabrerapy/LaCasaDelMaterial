# LCM-023 — Despliegue AWS

Estado 2026-10-10: IN_PROGRESS; infraestructura de aplicación sin desplegar. Cuenta independiente y acceso local confirmados por el cliente mediante STS. PRE-AWS QA: FAIL por falta de aceptación global PASS, no por fallo de una nueva prueba. Evidencia vigente en LOCAL-ACCEPTANCE.md.

| Fase | Estado | Pendiente |
| --- | --- | --- |
| A | IN_PROGRESS | Fundamento CDK de almacenamiento; completar arquitectura y estimación. |
| B | DONE | Cuenta existente del cliente separada de la organización; no se creó otra cuenta. Método de pago nuevo pospuesto por el cliente. |
| C | IN_PROGRESS | MFA root verificado y Budget mensual USD 10 existente; completar contactos y alertas 50/100/150/250 %. No afirmar límite de gasto garantizado. |
| D | IN_PROGRESS | lcm-admin con MFA; ReadOnlyAccess y SignInLocalDevelopmentAccess adjuntadas, IAMUserChangePassword conservada. Perfil temporal lcm-client e identidad STS confirmados por el cliente. Faltan permisos mínimos de despliegue, sujetos a revisión y aprobación. |
| E | TODO | Lambda/Fastify, Cognito, S3 adapter, frontend y resto CDK. |
| F | TODO | Estimación verificable, identidad, diff y aprobación antes de bootstrap/deploy. |
| G | TODO | Smoke no destructivo, permisos, backups, costos y rendimiento. |

Comandos offline disponibles: `npm.cmd run aws:test` y `npm.cmd run aws:synth`. Prueba estructural, compilación y lint CDK PASS el 2026-10-10; synth offline PASS. No equivalen a validación AWS. No hay comandos operativos de diff/deploy/web/bootstrap-admin todavía. El script deploy del paquete devuelve error deliberadamente.

Antes de crear cualquier recurso, presentar Account ID verificado, us-east-1, nombres de stacks, inventario e importe esperado sin créditos. Exigir aprobación explícita incluyendo bootstrap (S3 assets, posible ECR, IAM y SSM; sin CMK). No migrar QA, no seed ni ADMIN local en producción. Sin LCM-024.

El acceso actual no permite desplegar. No adjuntar AdministratorAccess ni crear claves permanentes para resolver este pendiente. La consola abierta en us-east-2 no cambia la región propuesta de aplicación: us-east-1. Definir la política de despliegue después del template completo; no inventar ARN ni ampliar permisos antes de conocer los recursos.

Verificación 2026-10-10: lint y build raíz PASS, sin modificar negocio. Angular produjo `apps/web/dist/web/browser/index.html` (existencia comprobada); no asumir otro directorio al preparar publicación. Advertencia previa no bloqueante: pos.component.css excede presupuesto en 152 bytes. Suites comerciales/DynamoDB no repetidas: este incremento solo añade infraestructura/documentación.
