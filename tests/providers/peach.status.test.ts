import { mapPeachStatusWithType } from '../../src/providers/peach/peach.status';
import { PaymentStatus } from '../../src/domain/enums';

describe('mapPeachStatusWithType', () => {
  it.each([
    ['000.000.000', 'DB', PaymentStatus.CAPTURED],
    ['000.100.110', 'DB', PaymentStatus.CAPTURED],
    ['000.100.112', 'PA', PaymentStatus.AUTHORIZED],
    ['000.100.110', 'RF', PaymentStatus.REFUNDED],
    ['000.100.110', 'CP', PaymentStatus.CAPTURED],
    ['000.100.110', 'RV', PaymentStatus.VOIDED],
    ['000.200.000', 'DB', PaymentStatus.PENDING],
    ['000.200.100', 'PA', PaymentStatus.PENDING],
    ['800.100.100', 'DB', PaymentStatus.FAILED],
    ['100.400.500', 'PA', PaymentStatus.FAILED],
    ['', 'DB', PaymentStatus.UNKNOWN]
  ])('maps result code %s with type %s to %s', (resultCode, paymentType, expected) => {
    expect(mapPeachStatusWithType(resultCode, paymentType)).toBe(expected);
  });
});
