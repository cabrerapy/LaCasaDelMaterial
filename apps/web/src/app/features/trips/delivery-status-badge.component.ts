import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DeliveryOutcome, DeliveryStatus } from '@lcm/contracts';

@Component({
  selector: 'lcm-delivery-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="tone()" role="status"><span aria-hidden="true">{{icon()}}</span> {{label()}}</span>`,
  styles: [`.badge{display:inline-flex;align-items:center;gap:.4rem;border:1px solid;border-radius:999px;padding:.4rem .7rem;font-weight:800;font-size:.82rem}.success{color:var(--success);background:var(--success-background)}.warning{color:var(--warning-text);background:var(--warning-background)}.danger{color:var(--error);background:var(--error-background)}.neutral{color:var(--color-text-secondary);background:var(--color-surface-secondary);border-color:var(--color-border)}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryStatusBadgeComponent {
  readonly outcome = input<DeliveryOutcome | undefined>();
  readonly status = input<DeliveryStatus | undefined>();
  label() { if (this.status() === 'VOIDED') return 'Entrega anulada'; if (this.status() === 'DRAFT') return 'Borrador'; switch(this.outcome()){case'FULL':return'Entrega completa';case'PARTIAL':return'Entrega parcial';case'FAILED':return'Entrega fallida';default:return'Pendiente';} }
  icon() { if (this.status() === 'DRAFT') return '●'; if (this.status() === 'VOIDED' || this.outcome() === 'FAILED') return '✕'; if (this.outcome() === 'FULL') return '✓'; if (this.outcome() === 'PARTIAL') return '⚠'; return '●'; }
  tone() { if (this.status() === 'DRAFT') return 'neutral'; if (this.status() === 'VOIDED' || this.outcome() === 'FAILED') return 'danger'; if (this.outcome() === 'FULL') return 'success'; if (this.outcome() === 'PARTIAL') return 'warning'; return 'neutral'; }
}
