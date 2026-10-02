# Identidad visual de La Casa del Material

## Personalidad

La interfaz combina la cercanía de un comercio local con la claridad de una herramienta operativa. La tortuga constructora es el recurso humano de la marca; el oro identifica acciones y selección; el tono tinta estructura la navegación.

## Recursos

- `apps/web/public/assets/brand/logo-main.png`: logotipo horizontal para superficies claras y espacios amplios.
- `apps/web/public/assets/brand/mascot-circle.png`: mascota circular para navegación, bienvenida y estados vacíos.
- `apps/web/public/assets/brand/app-icon.png`: icono de aplicación.
- `apps/web/public/assets/brand/favicon.png`: favicon.
- `apps/web/public/assets/brand/brand-reference.png`: lámina de referencia; no debe mostrarse en producción.

Los textos importantes se mantienen como HTML; no se depende del texto incluido en una imagen para comunicar contenido.

## Paleta

Los tokens oficiales viven en `apps/web/src/styles.css`. Los componentes nuevos deben consumir tokens semánticos (`--color-primary`, `--color-surface`, `--color-text`, etc.) y no valores hexadecimales aislados.

- Oro: `--lcm-gold-50` a `--lcm-gold-900`. Se usa para acciones, estados activos y acentos.
- Naranja: `--lcm-orange`. Se reserva para acentos de marca puntuales.
- Tinta: `--lcm-ink`. Se usa en navegación y texto de máximo contraste.
- Fondos: cálidos y neutros mediante `--color-background`, `--color-surface` y `--color-surface-secondary`.
- Estados: éxito, advertencia y error conservan colores semánticos propios; el verde no se usa como color decorativo de marca.

## Uso de componentes

- Botón primario: fondo oro y texto tinta; hover en oro más oscuro.
- Sidebar: fondo tinta, texto claro e indicador activo oro.
- Tablas: encabezados neutros claros y texto tinta.
- Foco: anillo oro visible, nunca depender solo del color para indicar estado.
- Logo: conservar proporción y área libre; no aplicar tintes ni deformaciones.

## Responsive

En escritorio, el acceso usa composición dividida y el sidebar permanece visible. Por debajo de 780 px, el acceso pasa a una sola columna y la navegación se convierte en panel desplegable con fondo de bloqueo.
