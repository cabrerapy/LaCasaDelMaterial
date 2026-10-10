# Cuenta AWS del cliente

Cuenta aún no creada. Nombre sugerido LaCasaDelMaterial-Production. El cliente conserva propiedad de root, facturación, recuperación, datos y recursos. Usar correo propio y datos comerciales reales; BUSINESS si corresponde. Introducir personalmente contraseña, verificación y método de pago en AWS, nunca en chat/Git.

Crear manualmente con Paid Account Plan (pay as you go), Basic Support; no soporte pago ni créditos como fundamento económico. Seguir [alta oficial AWS](https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html). Antes de desplegar: MFA root, recuperación y contactos Billing/Security/Operations del cliente. Sin access keys root ni uso diario del root.

Crear un único Budget independiente de la aplicación: mensual USD 10, costo real, avisos 50/100/150/250 % (USD 5/10/15/25), al correo del cliente. Sin apagado automático. No es un límite de cargos ni aviso instantáneo: [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

Acceso separado del desarrollador con MFA y permisos controlados. Preferir temporal: AWS CLI v2 mínimo 2.32.0 para `aws login --profile lcm-client`; requiere configuración IAM compatible y SignInLocalDevelopmentAccess. No compartir root. Ver [autenticación CLI oficial](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html).

Después: `aws sts get-caller-identity --profile lcm-client`, verificar cuenta/identidad y configurar región us-east-1. No pegar credenciales ni tokens. Crear cuenta no autoriza bootstrap/deploy: esperar estimación y aprobación explícita.
