# Infraestructura AWS

LCM-023-A en progreso. Paquete CDK v2 independiente del workspace comercial, TypeScript 6 strict y Node 24. Preparación offline: dos buckets privados SSE-S3, HTTPS obligatorio y RETAIN. No aplicación completa, no recursos creados en AWS.

Desde la raíz: `npm.cmd ci --prefix infrastructure/aws`, `npm.cmd run aws:test`, `npm.cmd run aws:synth`. El synth no consulta cuenta ni inventa Account ID. Región configurable con `npm.cmd --prefix infrastructure/aws run synth -- -c region=us-east-1`.

Despliegue bloqueado explícitamente. CloudFront/OAC, tablas, Lambda, HTTP API, Cognito y adaptadores siguen pendientes; no publicar este fundamento aislado. Estado y gates en [AWS-DEPLOYMENT](../../docs/AWS-DEPLOYMENT.md).

Preparación de publicación (sin AWS): `npm.cmd --prefix infrastructure/aws run prepare:runtime -- <outputs.json> <target.json>` compila y muestra un plan REVIEW_ONLY con configuración pública y política mínima para un objeto. target.json requiere exactamente bucket, expectedBucketOwner, region, frontendOrigin, stackName y outputKey, todos strings con valores reales del destino. No incluye credenciales, no aplica IAM ni carga objetos. No ejecutar redirección a runtime-config.json: la salida es un plan de revisión, no el archivo de configuración. Integración ejecutable y aprobación siguen pendientes.

Candidato offline `FrontendDelivery`: OAC firmado, redirect HTTPS, headers de seguridad, HTML sin cache y assets con cache. Función SPA reescribe rutas sin extensión a index.html; conserva API/assets y errores JS/CSS, sin fallback global 403/404. Tests estructurales y ejecución aislada de función. No conectado al app.ts ni seleccionado un plan CloudFront: costo/compatibilidad pendientes antes de integrar. La publicación deberá establecer Cache-Control adecuado y preservar assets previos durante actualizaciones. No frontend AWS desplegado.
