# La Casa del Material

Bootstrap del monolito modular para la gestión de un depósito de materiales. Incluye Angular 19, Fastify, un paquete de contratos compartidos y DynamoDB Local.

## Requisitos

- Node.js 20 o 22 (Angular 19 no soporta Node.js 24)
- npm 10 o superior
- Docker con Docker Compose

## Desarrollo local

```bash
npm install
copy .env.example .env
npm run dev:api
npm run dev:web
```

En macOS/Linux, use `cp` en lugar de `copy`. La web queda en `http://localhost:4200`, la API en `http://localhost:3000` y el health check en `http://localhost:3000/api/health`.

Para DynamoDB Local sin ejecutar el resto de servicios:

```bash
docker compose up dynamodb-local
```

## Stack completo con Docker

```bash
docker compose up --build
```

Servicios disponibles:

- Web: `http://localhost:4200`
- API: `http://localhost:3000/api/health`
- DynamoDB Local: `http://localhost:8000`

## Validación

```bash
npm run lint
npm test
npm run build
docker compose build
```

Las credenciales AWS del entorno local son valores ficticios requeridos por el SDK. No use credenciales reales en `.env`.

## Login local

Antes de iniciar la API, defina en `.env` una contraseña inicial y un secreto JWT propios:

```text
INITIAL_ADMIN_PASSWORD=<contraseña-local-segura>
JWT_SECRET=<secreto-local-de-al-menos-32-caracteres>
```

El usuario inicial es `admin`. En el primer arranque, la API crea este administrador en DynamoDB Local y almacena la contraseña con Argon2id. Los arranques posteriores no cambian su contraseña.

La sesión web usa `sessionStorage` durante el desarrollo local. Este mecanismo y el JWT local serán reemplazados o revisados al incorporar Cognito.
