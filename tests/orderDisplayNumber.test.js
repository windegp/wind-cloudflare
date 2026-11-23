import { expect, it } from 'vitest';
import { orderDisplayLabel, parseDisplayNumber } from '@/lib/orderDisplayNumber';
it('formats numbered canonical records and projections without altering internal IDs', () => {
  expect(orderDisplayLabel({ orderId: 'WIND-internal', orderNumber: 1001 })).toBe('#1001');
  expect(orderDisplayLabel({ Name: 'WIND-internal', 'Order Number': 1002 })).toBe('#1002');
  expect(orderDisplayLabel({ Name: '#75' })).toBe('#75');
  expect(orderDisplayLabel({ orderId: 'WIND-legacy', orderNumber: '1001' })).toBe('WIND-legacy');
  expect(orderDisplayLabel(null, 'WIND-fallback')).toBe('WIND-fallback');
});
it('parses only safe canonical sequential numbers, including Arabic digits', () => {
  for(const value of ['#1001','1001',' #١٠٠١ ']) expect(parseDisplayNumber(value)).toBe(1001);
  for(const value of ['1000','001001','1001.0','1e4','-1001','1001/x','1001 OR true','9007199254740992']) expect(parseDisplayNumber(value)).toBeNull();
});
