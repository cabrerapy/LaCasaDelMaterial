# LCM-023 — Despliegue AWS

Estado 2026-10-10: IN_PROGRESS; infraestructura de aplicación sin desplegar. Cuenta independiente y acceso local confirmados por el cliente mediante STS. PRE-AWS QA: FAIL por falta de aceptación global PASS, no por fallo de una nueva prueba. Evidencia vigente en LOCAL-ACCEPTANCE.md.

| Fase | Estado | Pendiente |
| --- | --- | --- |
| A | IN_PROGRESS | Fundamento CDK de almacenamiento; completar arquitectura y estimación. |
| B | DONE | Cuenta existente del cliente separada de la organización; no se creó otra cuenta. Método de pago nuevo pospuesto por el cliente. |
| C | IN_PROGRESS | MFA root verificado y Budget mensual USD 10 existente; completar contactos y alertas 50/100/150/250 %. No afirmar límite de gasto garantizado. |
| D | IN_PROGRESS | lcm-admin con MFA; ReadOnlyAccess y SignInLocalDevelopmentAccess adjuntadas, IAMUserChangePassword conservada. Perfil temporal lcm-client e identidad STS confirmados por el cliente. Faltan permisos mínimos de despliegue, sujetos a revisión y aprobación. |
| E | IN_PROGRESS | Composición, factory Lambda, verificación Cognito y repositorio del vínculo con tests offline; pendientes integración DynamoDB real, frontend/login Cognito, gestión de usuarios, entrypoint productivo, S3 y resto CDK. |
| F | TODO | Estimación verificable, identidad, diff y aprobación antes de bootstrap/deploy. |
| G | TODO | Smoke no destructivo, permisos, backups, costos y rendimiento. |

Comandos offline disponibles: `npm.cmd run aws:test` y `npm.cmd run aws:synth`. Prueba estructural, compilación y lint CDK PASS el 2026-10-10; synth offline PASS. No equivalen a validación AWS. No hay comandos operativos de diff/deploy/web/bootstrap-admin todavía. El script deploy del paquete devuelve error deliberadamente.

Antes de crear cualquier recurso, presentar Account ID verificado, us-east-1, nombres de stacks, inventario e importe esperado sin créditos. Exigir aprobación explícita incluyendo bootstrap (S3 assets, posible ECR, IAM y SSM; sin CMK). No migrar QA, no seed ni ADMIN local en producción. Sin LCM-024.

El acceso actual no permite desplegar. No adjuntar AdministratorAccess ni crear claves permanentes para resolver este pendiente. La consola abierta en us-east-2 no cambia la región propuesta de aplicación: us-east-1. Definir la política de despliegue después del template completo; no inventar ARN ni ampliar permisos antes de conocer los recursos.

Preparación Lambda: `createDynamoDbRepositories` construye repositorios sin ejecutar solicitudes. `server.ts` conserva exclusivamente el flujo local/Docker de creación de tablas, bootstrap, señales y escucha. El futuro entrypoint Lambda no debe importar `server.ts`; debe inyectar autenticación Cognito y almacenamiento S3 antes de exponerse en producción. La prueba de composición usa un transporte que rechaza cualquier acceso de red y comprueba health/401 sin abrir socket; no equivale a un smoke AWS.

`createLambdaHandler` utiliza @fastify/aws-lambda 6.4.2 fijado en lockfile, soporta HTTP API payload 2.0 y reutiliza la aplicación entre invocaciones concurrentes/calientes. Decora antes de ready, no serializa event/context en headers y conserva query strings con comas como texto. Pruebas offline: JSON, códigos 200/201/401/404, binarios base64, ausencia de socket y fallo de inicialización sin reintentos en el mismo contenedor. Es una factory inyectable, no un entrypoint exportado ni una validación de permisos Cognito; no configurar Lambda contra este archivo todavía.

Adaptador `CognitoAuthentication`: aws-jwt-verify 5.2.1 fijado; factory configurada con pool, client y tokenUse access. Verifica firma/issuer/client/vencimiento y resuelve exclusivamente por sub estable mediante resolver inyectado. Rechaza usuarios inexistentes, INACTIVE o vínculos inconsistentes, ignora grupos como fuente de rol y no emite tokens locales. AuthService soporta verificación asíncrona y bloquea login local antes de consultar contraseña en modo Cognito. Pruebas RSA/JWKS offline cubren firma inválida, vencimiento, issuer/client incorrectos e ID token; no crean recursos AWS. Falta integrar el repositorio de vínculo único, administración Cognito con compensación y frontend/login; adaptador aún no activado en server.ts ni producción. No sustituir el resolver por búsqueda de email/username.

Vínculo persistente implementado como repositorio, no ejecutado: `DynamoDbCognitoLinkRepository` y `createCognitoUserResolver`. Patrón y reservas documentados en ACCESS-PATTERNS. Sin nueva tabla/GSI; transacción verifica existencia del usuario y unicidad bidireccional, permite repetir el mismo par. Tests offline capturan comandos y simulan lecturas; no equivalen a prueba de concurrencia DynamoDB. Vincular requiere futuro flujo administrativo con auditoría y compensación Cognito; no hay endpoint público ni backfill. No activar producción hasta cerrar esa integración.

Verificación 2026-10-10: lint y build raíz PASS, sin modificar negocio. Angular produjo `apps/web/dist/web/browser/index.html` (existencia comprobada); no asumir otro directorio al preparar publicación. Advertencia previa no bloqueante: pos.component.css excede presupuesto en 152 bytes. Suites comerciales/DynamoDB no repetidas: este incremento solo añade infraestructura/documentación.
