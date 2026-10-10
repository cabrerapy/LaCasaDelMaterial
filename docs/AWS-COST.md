# Estimación AWS — pendiente de cálculo

2026-10-10, región propuesta us-east-1. Objetivo USD 10/mes, no límite garantizado. No se ha verificado todavía un total ni la referencia USD 2–7. No se descuentan créditos. No recursos creados.

| Entrada mensual | LOW | EXPECTED | HIGHER USAGE |
| --- | ---: | ---: | ---: |
| Usuarios | 10 | 15 | 20 |
| API requests | 25.000 | 100.000 | 500.000 |
| Lecturas DynamoDB | 500.000 | 2.000.000 | 10.000.000 |
| Escrituras DynamoDB | 50.000 | 200.000 | 1.000.000 |
| Datos DB (GB) | 0,25 | 1 | 5 |
| Evidencias S3 (GB) | 1 | 5 | 25 |
| Logs ingeridos (GB) | 0,25 | 1 | 5 |
| Transferencia frontend (GB) | 2,5 | 10 | 50 |

Son supuestos, no mediciones. Cotizar CloudFront (evaluar plan gratuito y compatibilidad), S3 frontend/requests, HTTP API, Lambda ARM64 512 MB, DynamoDB requests/índices/almacenamiento, PITR, Cognito Lite, S3 evidencias/requests, CloudWatch 14 días, bootstrap assets y transferencia. Totales LOW/EXPECTED/HIGHER: PENDING.

## Tarifas verificadas y cálculo parcial — 2026-10-10

Referencias oficiales consultadas para us-east-1. No descontar créditos promocionales ni free tier en este subtotal conservador. No es una cotización final ni autorización de despliegue.

| Componente | Tarifa / supuesto declarado | LOW USD | EXPECTED USD | HIGHER USD |
| --- | --- | ---: | ---: | ---: |
| HTTP API | USD 1/millón de unidades, solicitudes menores de 512 KB | 0,025 | 0,100 | 0,500 |
| Lambda ARM64 512 MB | USD 0,0000133334/GB-s y 0,20/millón; duración facturada media supuesta 0,5 s, incluida inicialización | 0,088334 | 0,353335 | 1,766675 |
| DynamoDB lecturas | USD 0,125/millón RRUs; dos RRUs por lectura lógica como sensibilidad, no medición | 0,125 | 0,500 | 2,500 |
| DynamoDB escrituras | USD 0,625/millón WRUs; diez WRUs por escritura lógica incluyendo transacciones e índices como sensibilidad | 0,3125 | 1,2500 | 6,2500 |
| DynamoDB PITR | USD 0,20/GB-mes sobre tamaño base supuesto; excluye GSIs | 0,050 | 0,200 | 1,000 |
| CloudWatch ingestión Standard | USD 0,50/GB sin descuento gratuito; volumen combinado API/Lambda | 0,125 | 0,500 | 2,500 |
| DynamoDB almacenamiento Standard | USD 0,25/GB-mes; tamaño base × 3 como sensibilidad de base más GSIs, sin free tier | 0,1875 | 0,7500 | 3,7500 |
| CloudWatch almacenamiento | USD 0,03/GB-mes; volumen ingresado × 14/30, sin asumir compresión ni free tier | 0,0035 | 0,0140 | 0,0700 |
| Cognito Lite | USD 0,0055/MAU, calculado sin free tier; solo autenticación directa, sin SMS ni ASF | 0,0550 | 0,0825 | 0,1100 |
| **Subtotal parcial** | **No incluye todos los servicios** | **0,971834** | **3,749835** | **18,446675** |

Fórmulas: Lambda = requests × (0,5 GB × 0,5 segundos × tarifa + 0,20 / 1.000.000). DynamoDB = lecturas × 2 × tarifa RRU + escrituras × 10 × tarifa WRU. Los multiplicadores son una prueba de sensibilidad; deben reemplazarse por tamaño, consistencia, transacciones y proyecciones reales antes de aprobar costos. Operaciones mayores a 4 KB/1 KB, scans, reintentos y más índices pueden aumentarlos. No confundir request HTTP, operación lógica e item facturable.

Fuentes: [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB y PITR](https://aws.amazon.com/dynamodb/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).

Almacenamiento DynamoDB: el factor × 3 es una sensibilidad de ocupación, no un conteo de índices ni medición. PITR conserva tamaño base separado: no multiplicarlo por los GSIs. Logs: retención uniforme de 14 días en régimen estable de un mes de 30 días; la compresión efectiva puede reducir el cargo. Cognito: se omite conservadoramente el free tier publicado de 10.000 MAU; no contratar funciones avanzadas ni SMS. Email de invitación/recuperación debe revisarse aparte según el mecanismo elegido.

Fuentes adicionales: [almacenamiento DynamoDB us-east-1](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CostOptimization_TableLevelCostAnalysis.html), [Cognito Lite](https://aws.amazon.com/cognito/pricing/), [archivo de logs](https://aws.amazon.com/cloudwatch/pricing/).

### S3 y modelo reproducible

Referencia complementaria oficial reciente: [AWS Storage Blog, S3 Standard](https://aws.amazon.com/blogs/storage/run-spark-31-faster-and-optimize-compute-costs-with-amazon-s3-express-one-zone-on-amazon-emr/) publica USD 0,023/GB-mes, GET/HEAD USD 0,0004/1.000 y LIST USD 0,005/1.000. Confirmar región en Calculator antes de aprobar; no se obtuvo la tabla dinámica regional de la página de precios. No extrapolar el precio LIST a PUT sin verificación adicional.

Supuesto EXPECTED adicional: 5 GB evidencias más 1 GB combinado de frontend/assets retenidos; 100.000 GET/HEAD y 1.000 LIST mensuales. Almacenamiento USD 0,138, GET/HEAD USD 0,040 y LIST USD 0,005. **Subtotal EXPECTED actualizado: USD 3,932835**, todavía incompleto. El GB adicional incluye versiones históricas de assets como supuesto, no tamaño medido del build.

`infrastructure/aws/lib/cost-model.ts` reproduce este subtotal offline y rechaza entradas negativas/no finitas; su test comprueba cálculo sin créditos ni llamadas a AWS. Dinero de negocio en guaraníes no cambia: este modelo separado utiliza tarifas fraccionarias USD para infraestructura.

Pendientes de sumar y verificar: S3 PUT/uploads y metadatos, CloudFront/función SPA, transferencia API/evidencias, monitoreo elegido, emails y operaciones de despliegue/restauración. No afirmar EXPECTED menor a USD 10 a partir del subtotal. LOW/HIGHER de la tabla anterior todavía excluyen S3; no compararlos como totales completos.

[CloudFront](https://aws.amazon.com/cloudfront/pricing/) publica un plan Free USD 0 con 100 GB y un millón de requests mensuales. Es un candidato, no un plan seleccionado: verificar compatibilidad efectiva con OAC, función de rutas SPA, CDK y elegibilidad de la cuenta. No descontar sus créditos S3 ni seleccionar planes pagos automáticamente. Preparar alternativa pay-as-you-go si el plan no admite el diseño.

No se generó todavía una estimación guardada de AWS Pricing Calculator. HIGHER ya supera USD 10 con este subtotal; requiere alertas y revisión de consumo, no apagado automático. El total EXPECTED continúa PENDING.

Faltan tamaños por item, consistencia y transacciones (un request no equivale a una unidad facturable), amplificación por índices, duración Lambda medida o supuesto declarado, volumen estático, operaciones S3 y transferencia API. Registrar tarifas oficiales, fecha, unidades y fórmula por servicio en esta misma página y contrastar [AWS Pricing Calculator](https://calculator.aws/). Si EXPECTED supera USD 10, detener diseño y proponer optimizaciones antes de aprobación. No contratar servicios adicionales ni seleccionar plan CloudFront pago.
