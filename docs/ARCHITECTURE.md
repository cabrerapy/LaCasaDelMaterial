# Arquitectura

La Casa del Material es un monolito modular en un monorepo npm. `apps/web` contiene la interfaz Angular 22 responsive; `apps/api`, la API REST Node.js/Fastify; y `packages/contracts`, los contratos mínimos compartidos.

En desarrollo, Docker Compose conecta web, API y DynamoDB Local. La web usa un proxy para `/api`, evitando acoplarla a una URL concreta. La configuración de DynamoDB admite un endpoint local opcional; en AWS se omitirá ese endpoint.

LCM-023 inicia CDK v2/TypeScript local en `infrastructure/aws`: dos buckets privados, sin despliegue. Objetivo pendiente: Angular estático S3/CloudFront OAC, HTTP API/Lambda Node 24 ARM64, DynamoDB on-demand/PITR/deletion protection/RETAIN, Cognito Lite, evidencias S3 y logs 14 días. Esos componentes y adaptadores aún no están implementados. Gates en AWS-DEPLOYMENT.md; Docker/auth/storage locales sin cambios.

La autenticación local usa un proveedor JWT detrás de una interfaz de autenticación y un repositorio de usuarios desacoplado de DynamoDB. Esto permite reemplazar el proveedor local por Cognito sin acoplar las rutas ni la lógica de negocio al formato del token actual.
