import { describe, expect, it } from 'vitest';
import { money } from './money';

describe('money', () => {
  it('lleva $ y dos decimales', () => {
    expect(money(1000)).toBe('$1,000.00');
    expect(money(7047.18)).toBe('$7,047.18');
  });

  it('con signo usa + y el menos real (−)', () => {
    expect(money(1000, true)).toBe('+$1,000.00');
    expect(money(-249, true)).toBe('−$249.00');
  });

  it('el cero no lleva signo', () => {
    expect(money(0, true)).toBe('$0.00');
  });

  it('sin signo explícito solo marca los negativos', () => {
    expect(money(-12.5)).toBe('−$12.50');
  });
});
