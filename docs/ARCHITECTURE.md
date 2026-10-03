# Arquitectura

La Casa del Material es un monolito modular en un monorepo npm. `apps/web` contiene la interfaz Angular 22 responsive; `apps/api`, la API REST Node.js/Fastify; y `packages/contracts`, los contratos mínimos compartidos.

En desarrollo, Docker Compose conecta web, API y DynamoDB Local. La web usa un proxy para `/api`, evitando acoplarla a una URL concreta. La configuración de DynamoDB admite un endpoint local opcional; en AWS se omitirá ese endpoint.

La infraestructura futura se definirá con AWS CDK en TypeScript y podrá usar Lambda, API Gateway, DynamoDB, Cognito, S3 y CloudFront. Esa infraestructura no forma parte de LCM-001.

La autenticación local usa un proveedor JWT detrás de una interfaz de autenticación y un repositorio de usuarios desacoplado de DynamoDB. Esto permite reemplazar el proveedor local por Cognito sin acoplar las rutas ni la lógica de negocio al formato del token actual.
