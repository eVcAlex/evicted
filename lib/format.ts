/** Pence to a display string, e.g. `200` → `£2.00`. */
export function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
