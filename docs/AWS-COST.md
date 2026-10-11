# Estimación AWS — pendiente de cálculo

## Transferencia directa de evidencias — 2026-10-11

Subtotal EXPECTED ampliado actual: **USD 6,0776675/mes**, todavía parcial. Campo s3DirectDownloadGb explícito, separado de evidenceGb almacenados y cloudFrontViewerGb. Supuesto 5 GB/mes × USD 0,09/GB = USD 0,45 sin franquicias gratuitas; reemplaza USD 5,6276675 como salida del modelo. Repetir descargas incrementa transferencia sin aumentar necesariamente almacenamiento. No incluir tráfico S3→CloudFront en este campo; sí descargas firmadas directas, incluidos bytes facturables de reintentos. Transfer Acceleration no está habilitado.

Tarifa USD 0,09/GB como candidata de primer tramo: [guía oficial AWS Data Transfer Hub](https://docs.aws.amazon.com/solutions/latest/data-transfer-hub/cost.html) incluye ese precio en su ejemplo de S3 en Oregon; [precios S3](https://aws.amazon.com/s3/pricing/) varían por región/destino. **Confirmación específica de us-east-1 mediante Price List/Calculator pendiente**, no presentar el ejemplo Oregon como cotización verificada de Virginia. Modelo rechaza más de 10.000 GB para exigir tramos/consumo agregado; esto no implementa un límite de uso real. Confirmar tarifas/franquicias de la cuenta antes de aprobación; bootstrap, emails, restauraciones, impuestos y margen por abuso siguen pendientes.

## Extensión CloudFront pay-as-you-go — 2026-10-11

Subtotal EXPECTED ampliado del modelo: **USD 5,6276675/mes**, todavía parcial; reemplaza USD 4,0151675 como salida actual de cost-model.ts. No es una factura prevista ni autorización de despliegue. [Tarifas oficiales por región y Functions](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) consultadas hoy: Sudamérica USD 0,110/GB al visitante en primer tramo pagado, USD 0,125/GB hacia origen, USD 0,022/10.000 solicitudes HTTPS; Functions USD 0,10/millón invocaciones. Modelo bruto sin franquicias/free tier; no seleccionar un plan flat-rate pago ni contratar compromiso. Para tráfico superior a 10.000 GB el modelo exige cálculo por tramos, no extrapola esa tarifa.

Supuestos adicionales explícitos: 10 GB entregados combinando frontend y API, 0,5 GB hacia origen (incluye uploads/cuerpos), 200.000 solicitudes HTTPS (incluye las 100.000 de API, no solo S3), 100.000 invocaciones de función SPA. Aportes respectivos USD 1,10 + 0,0625 + 0,44 + 0,01 = **USD 1,6125**. No aplicar función SPA a /api ni a behaviors separados de assets. Tarifa Sudamérica es sensibilidad, no prueba de edge real: usuarios de otras geografías deben desglosarse. Descargas firmadas de evidencia salen directamente desde S3 y NO están cubiertas por los GB CloudFront; transferencia S3 directa sigue pendiente. No duplicar salida AWS→CloudFront cuando corresponda exención oficial. Bootstrap, restauraciones, emails, abuso y cargos extraordinarios/impuestos siguen pendientes.

2026-10-11, región propuesta us-east-1. Objetivo USD 10/mes, no límite garantizado. No se ha verificado todavía un total ni la referencia USD 2–7. No se descuentan créditos. No recursos creados. Corrección verificada hoy: tarifa Lambda x86_64, conforme al stack candidato; otras tarifas consultadas el 2026-10-10 deben reconfirmarse antes de aprobación.

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

Son supuestos, no mediciones. Cotizar CloudFront (evaluar plan gratuito y compatibilidad), S3 frontend/requests, HTTP API, Lambda x86_64 512 MB, DynamoDB requests/índices/almacenamiento, PITR, Cognito Lite, S3 evidencias/requests, CloudWatch 7 días, bootstrap assets y transferencia. Totales LOW/EXPECTED/HIGHER: PENDING.

## Tarifas verificadas y cálculo parcial — 2026-10-10

Referencias oficiales consultadas para us-east-1. No descontar créditos promocionales ni free tier en este subtotal conservador. No es una cotización final ni autorización de despliegue.

| Componente | Tarifa / supuesto declarado | LOW USD | EXPECTED USD | HIGHER USD |
| --- | --- | ---: | ---: | ---: |
| HTTP API | USD 1/millón de unidades, solicitudes menores de 512 KB | 0,025 | 0,100 | 0,500 |
| Lambda x86_64 512 MB | USD 0,0000166667/GB-s y 0,20/millón; duración facturada media supuesta 0,5 s, incluida inicialización | 0,109167 | 0,436668 | 2,183338 |
| DynamoDB lecturas | USD 0,125/millón RRUs; dos RRUs por lectura lógica como sensibilidad, no medición | 0,125 | 0,500 | 2,500 |
| DynamoDB escrituras | USD 0,625/millón WRUs; diez WRUs por escritura lógica incluyendo transacciones e índices como sensibilidad | 0,3125 | 1,2500 | 6,2500 |
| DynamoDB PITR | USD 0,20/GB-mes sobre tamaño base supuesto; excluye GSIs | 0,050 | 0,200 | 1,000 |
| CloudWatch ingestión Standard | USD 0,50/GB sin descuento gratuito; volumen combinado API/Lambda | 0,125 | 0,500 | 2,500 |
| DynamoDB almacenamiento Standard | USD 0,25/GB-mes; tamaño base × 3 como sensibilidad de base más GSIs, sin free tier | 0,1875 | 0,7500 | 3,7500 |
| CloudWatch almacenamiento | USD 0,03/GB-mes; volumen ingresado × 7/30, sin asumir compresión ni free tier | 0,00175 | 0,0070 | 0,0350 |
| Cognito Lite | USD 0,0055/MAU, calculado sin free tier; solo autenticación directa, sin SMS ni ASF | 0,0550 | 0,0825 | 0,1100 |
| **Subtotal parcial** | **No incluye todos los servicios** | **0,990917** | **3,826168** | **18,828338** |

Fórmulas: Lambda = requests × (0,5 GB × 0,5 segundos × tarifa + 0,20 / 1.000.000). DynamoDB = lecturas × 2 × tarifa RRU + escrituras × 10 × tarifa WRU. Los multiplicadores son una prueba de sensibilidad; deben reemplazarse por tamaño, consistencia, transacciones y proyecciones reales antes de aprobar costos. Operaciones mayores a 4 KB/1 KB, scans, reintentos y más índices pueden aumentarlos. No confundir request HTTP, operación lógica e item facturable.

Fuentes: [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB y PITR](https://aws.amazon.com/dynamodb/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).

Almacenamiento DynamoDB: el factor × 3 es una sensibilidad de ocupación, no un conteo de índices ni medición. PITR conserva tamaño base separado: no multiplicarlo por los GSIs. Logs: retención uniforme de 7 días en régimen estable de un mes de 30 días; la compresión efectiva puede reducir el cargo. Cognito: se omite conservadoramente el free tier publicado de 10.000 MAU; no contratar funciones avanzadas ni SMS. Email de invitación/recuperación debe revisarse aparte según el mecanismo elegido.

Fuentes adicionales: [almacenamiento DynamoDB us-east-1](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CostOptimization_TableLevelCostAnalysis.html), [Cognito Lite](https://aws.amazon.com/cognito/pricing/), [archivo de logs](https://aws.amazon.com/cloudwatch/pricing/).

### S3 y modelo reproducible

Referencia complementaria oficial reciente: [AWS Storage Blog, S3 Standard](https://aws.amazon.com/blogs/storage/run-spark-31-faster-and-optimize-compute-costs-with-amazon-s3-express-one-zone-on-amazon-emr/) publica USD 0,023/GB-mes, GET/HEAD USD 0,0004/1.000 y LIST USD 0,005/1.000. Confirmar región en Calculator antes de aprobar; no se obtuvo la tabla dinámica regional de la página de precios. No extrapolar el precio LIST a PUT sin verificación adicional.

Supuesto EXPECTED adicional: 5 GB evidencias más 1 GB combinado de frontend/assets retenidos; 100.000 GET/HEAD, 1.000 LIST y 1.200 PUT/COPY/POST mensuales. Almacenamiento USD 0,138, GET/HEAD USD 0,040, LIST USD 0,005 y PUT/COPY/POST USD 0,006. **Subtotal EXPECTED actualizado: USD 4,0151675**, todavía incompleto. El GB adicional incluye versiones históricas de assets como supuesto, no tamaño medido del build. Reemplaza el cálculo previo ARM/14 días y agrega operaciones de escritura; no representa el costo total del stack.

PUT/COPY/POST: tarifa candidata S3 Standard us-east-1 USD 0,005/1.000 operaciones, contrastada con [precios S3](https://aws.amazon.com/s3/pricing/) y ejemplo de cargos de solicitudes en [FAQ oficial S3](https://aws.amazon.com/s3/faqs/) el 2026-10-11. Los 1.200 requests son un supuesto (1.000 cargas y 200 operaciones de publicación/reintento), no uso real. Contar operaciones facturables, no archivos únicos; multipart, copias y reintentos pueden aumentar el conteo. bootstrap/CDK asset storage, transferencia y operaciones extraordinarias deben presupuestarse aparte. Campo s3Puts obligatorio incluso si es cero; conteos enteros/no negativos verificados por tests. Esto no realiza uploads ni modifica IAM/S3.

`infrastructure/aws/lib/cost-model.ts` reproduce este subtotal offline y rechaza entradas negativas/no finitas; su test comprueba cálculo sin créditos ni llamadas a AWS. Dinero de negocio en guaraníes no cambia: este modelo separado utiliza tarifas fraccionarias USD para infraestructura.

Pendientes de sumar y verificar: medición real de S3 PUT/uploads, metadatos y almacenamiento de bootstrap; CloudFront/función SPA, transferencia API/evidencias, monitoreo elegido, emails y operaciones extraordinarias de despliegue/restauración. No afirmar EXPECTED menor a USD 10 a partir del subtotal. LOW/HIGHER de la tabla anterior todavía excluyen S3; no compararlos como totales completos.

[CloudFront](https://aws.amazon.com/cloudfront/pricing/) publica un plan Free USD 0 con 100 GB y un millón de requests mensuales. Es un candidato, no un plan seleccionado: verificar compatibilidad efectiva con OAC, función de rutas SPA, CDK y elegibilidad de la cuenta. No descontar sus créditos S3 ni seleccionar planes pagos automáticamente. Preparar alternativa pay-as-you-go si el plan no admite el diseño.

No se generó todavía una estimación guardada de AWS Pricing Calculator. HIGHER ya supera USD 10 con este subtotal; requiere alertas y revisión de consumo, no apagado automático. El total EXPECTED continúa PENDING.

Faltan tamaños por item, consistencia y transacciones (un request no equivale a una unidad facturable), amplificación por índices, duración Lambda medida o supuesto declarado, volumen estático, operaciones S3 y transferencia API. Registrar tarifas oficiales, fecha, unidades y fórmula por servicio en esta misma página y contrastar [AWS Pricing Calculator](https://calculator.aws/). Si EXPECTED supera USD 10, detener diseño y proponer optimizaciones antes de aprobación. No contratar servicios adicionales ni seleccionar plan CloudFront pago.
