# Seguridad AWS — pendientes

Solo template local de buckets privados, SSE-S3, HTTPS y RETAIN implementado; sin comprobación AWS real. Antes de desplegar: cuenta del cliente, root MFA sin access keys, recuperación/contactos, acceso temporal independiente, costo, aceptación local PASS y aprobación.

Pendientes: Cognito Lite sin self-registration/SMS ni client secret Angular; validar issuer/client/token-use/expiry/refresh/logout, vinculación estable, ACTIVE/permisos backend y compensación de altas parciales. S3 reutilizando interfaz local: revisar límites binarios/base64 de HTTP API/Lambda, presigned si procede, validar contenido/tamaño/pertenencia y descarga autorizada. Logs redactados/14 días, IAM mínimo, DynamoDB PITR/deletion protection/RETAIN. Sin secretos en Git, bundles, outputs o logs; sin migración QA.

Synth no acredita seguridad productiva: verificar recursos efectivos, 401/403, aislamiento, privacidad y recuperación no destructiva después del deploy aprobado.
