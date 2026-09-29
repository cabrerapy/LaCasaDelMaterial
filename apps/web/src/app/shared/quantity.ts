export function displayToInternal(displayQuantity: number, quantityScale: number): number {
  if (!Number.isFinite(displayQuantity) || displayQuantity < 0 || !Number.isSafeInteger(quantityScale) || quantityScale <= 0) {
    throw new Error('Cantidad o escala inválida');
  }
  const scaled = displayQuantity * quantityScale;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-9) {
    throw new Error('La cantidad no puede representarse con esta escala');
  }
  return rounded;
}

export function internalToDisplay(internalQuantity: number, quantityScale: number): number {
  if (!Number.isSafeInteger(internalQuantity) || internalQuantity < 0 || !Number.isSafeInteger(quantityScale) || quantityScale <= 0) {
    throw new Error('Cantidad interna o escala inválida');
  }
  return internalQuantity / quantityScale;
}
