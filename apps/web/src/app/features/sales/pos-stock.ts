import type { SaleCatalogItem } from '@lcm/contracts';

export interface PosCartLine { readonly catalog: SaleCatalogItem; readonly quantity: string; }

// Compare scaled integer quantities, never rounded presentation units.
function requestedBase(line: PosCartLine): bigint | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(line.quantity)) return null;
  const [whole, fraction = ''] = line.quantity.split('.');
  const numerator = BigInt(whole + fraction);
  const base = line.catalog.baseQuantityInternal;
  if (numerator <= 0n || !Number.isSafeInteger(base) || base <= 0) return null;
  const denominator = 10n ** BigInt(fraction.length);
  const scaled = numerator * BigInt(base);
  if (scaled % denominator !== 0n) return null;
  const result = scaled / denominator;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? result : null;
}

export function quantityWarning(lines: readonly PosCartLine[]): string | null {
  for (const line of lines) {
    if (requestedBase(line) === null) return `Cantidad inválida para ${line.catalog.name}: usa una cantidad positiva representable en su unidad base.`;
  }
  return null;
}

export function stockWarning(lines: readonly PosCartLine[]): string | null {
  const requested = new Map<string, bigint>();
  for (const line of lines) {
    const quantity = requestedBase(line);
    if (!line.catalog.trackStock || quantity === null) continue;
    const total = (requested.get(line.catalog.productId) ?? 0n) + quantity;
    requested.set(line.catalog.productId, total);
  }
  for (const line of lines) {
    const item = line.catalog;
    if (!item.trackStock) continue;
    if (!Number.isSafeInteger(item.availableBaseInternal) || item.availableBaseInternal! < 0) return `No se pudo verificar el stock de ${item.name}. Recarga el catálogo.`;
    if ((requested.get(item.productId) ?? 0n) > BigInt(item.availableBaseInternal!)) {
      return `Stock insuficiente para ${item.name}. Disponible: ${stockDisplay(item)}. Reduce la cantidad antes de confirmar.`;
    }
  }
  return null;
}

export function stockDisplay(item: SaleCatalogItem): string {
  return `${(item.availableBaseInternal ?? 0) / item.quantityScale} ${item.baseUnit}`;
}
