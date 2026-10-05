import { describe, expect, it } from 'vitest';
import type { SaleCatalogItem } from '@lcm/contracts';
import { quantityWarning, stockDisplay, stockWarning } from './pos-stock';

const bag: SaleCatalogItem = { productId: 'cement', presentationId: 'bag', code: 'CEM', name: 'Cemento', presentationName: 'Bolsa', baseQuantityInternal: 1, quantityScale: 1, baseUnit: 'UNIT', unitPriceGuarani: 65000, availableBaseInternal: 80, trackStock: true };
describe('POS stock prevention', () => {
  it('accepts exact stock and warns above it', () => {
    expect(stockWarning([{ catalog: bag, quantity: '80' }])).toBeNull();
    expect(stockWarning([{ catalog: bag, quantity: '81' }])).toContain('Disponible: 80 UNIT');
  });
  it('adds different presentations of the same product', () => {
    const pallet = { ...bag, presentationId: 'pallet', baseQuantityInternal: 50 };
    expect(stockWarning([{ catalog: pallet, quantity: '1' }, { catalog: bag, quantity: '31' }])).toContain('Stock insuficiente');
    expect(stockWarning([{ catalog: pallet, quantity: '1' }, { catalog: bag, quantity: '30' }])).toBeNull();
  });
  it('compares fractional quantities exactly in scaled units', () => {
    const sand: SaleCatalogItem = { ...bag, baseUnit: 'M3', quantityScale: 1000, baseQuantityInternal: 1000, availableBaseInternal: 2500 };
    expect(stockDisplay(sand)).toBe('2.5 M3');
    expect(stockWarning([{ catalog: sand, quantity: '2.5' }])).toBeNull();
    expect(stockWarning([{ catalog: sand, quantity: '2.501' }])).toContain('Stock insuficiente');
    expect(quantityWarning([{ catalog: sand, quantity: '0.0001' }])).toContain('Cantidad inválida');
  });
  it('ignores stock for untracked products, not invalid quantities', () => {
    expect(stockWarning([{ catalog: { ...bag, trackStock: false }, quantity: '100' }])).toBeNull();
    for (const quantity of ['', '0', '-1', 'NaN', '1e2', '0.5', '99999999999999999999']) {
      expect(quantityWarning([{ catalog: bag, quantity }])).toContain('Cantidad inválida');
    }
  });
  it('fails closed when availability is missing', () => {
    expect(stockWarning([{ catalog: { ...bag, availableBaseInternal: undefined }, quantity: '1' }])).toContain('Recarga el catálogo');
  });
});
