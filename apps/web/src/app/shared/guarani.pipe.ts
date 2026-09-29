import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({ name: 'guarani', standalone: true })
export class GuaraniPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value)}`;
  }
}
