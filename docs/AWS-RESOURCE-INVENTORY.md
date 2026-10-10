# Inventario AWS

2026-10-10: cuenta pendiente, cero recursos desplegados. Template local LcmProductionFoundation: dos AWS::S3::Bucket y dos AWS::S3::BucketPolicy, nombres físicos generados; SSE-S3, Block Public Access completo, propiedad del bucket, HTTPS y RETAIN. Sin KMS propio ni borrado automático.

Pendientes: CloudFront/OAC/cache/SPA, HTTP API/JWT, Lambda ZIP Node 24 ARM64 512 MB/15 s y rol mínimo, logs 14 días, 16 tablas/índices existentes/on-demand/PITR/deletion protection/RETAIN, Cognito Lite. No figuran todavía en template. Budget manual y bootstrap requieren revisión separada. Sin servicios prohibidos.
