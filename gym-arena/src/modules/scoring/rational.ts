/**
 * Exact rational arithmetic for scoring (pure, no I/O).
 *
 * Why: every scoring input is a terminating decimal (weights in 0.5 kg steps, reps are
 * integers, km in 0.1 steps) and every formula in SCORING_SPECIFICATION §2–§3 uses only
 * +, −, ×, ÷, min and max. All scores are therefore exact rationals. Computing them as
 * fractions of BigInts keeps "full precision" literally true (§5): two mathematically
 * equal totals compare as equal, and two different totals never compare as equal.
 * Binary floating point cannot guarantee either (0.1 + 0.2 ≠ 0.3).
 *
 * Display rounding (half-up to integers, §5) is a separate, explicit step.
 */
export type Decimal = number | string;

const ZERO_N = BigInt(0);
const ONE_N = BigInt(1);
const TWO_N = BigInt(2);
const TEN_N = BigInt(10);

function gcd(a: bigint, b: bigint): bigint {
  let x = a < ZERO_N ? -a : a;
  let y = b < ZERO_N ? -b : b;
  while (y !== ZERO_N) {
    [x, y] = [y, x % y];
  }
  return x;
}

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export class Rational {
  /** Always normalized: denominator > 0 and gcd(|numerator|, denominator) = 1. */
  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {}

  static readonly ZERO = new Rational(ZERO_N, ONE_N);
  static readonly ONE = new Rational(ONE_N, ONE_N);

  static fraction(numerator: bigint, denominator: bigint = ONE_N): Rational {
    if (denominator === ZERO_N) throw new RangeError("Rational: division by zero");
    const sign = denominator < ZERO_N ? -ONE_N : ONE_N;
    const g = gcd(numerator, denominator);
    return new Rational((sign * numerator) / g, (sign * denominator) / g);
  }

  static int(value: number): Rational {
    if (!Number.isSafeInteger(value)) throw new RangeError(`Rational.int: not a safe integer: ${value}`);
    return new Rational(BigInt(value), ONE_N);
  }

  /**
   * Exact value of a decimal. Numbers are read through their shortest decimal
   * representation (e.g. 72.5 → "72.5", 0.1 → "0.1"), which is exactly the decimal the
   * value was written as — so 0.1 becomes 1/10, not the binary approximation.
   * Database `numeric` values arrive as strings and are parsed directly.
   */
  static from(value: Decimal | Rational): Rational {
    if (value instanceof Rational) return value;
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new RangeError(`Rational.from: not a finite number: ${value}`);
    }
    const match = DECIMAL.exec(String(value).trim());
    if (!match) throw new RangeError(`Rational.from: not a decimal: ${String(value)}`);
    const [, sign, whole, fraction = "", exponent = "0"] = match;
    let numerator = BigInt(whole + fraction);
    let denominator = TEN_N ** BigInt(fraction.length);
    const exp = Number(exponent);
    if (exp >= 0) numerator *= TEN_N ** BigInt(exp);
    else denominator *= TEN_N ** BigInt(-exp);
    return Rational.fraction(sign === "-" ? -numerator : numerator, denominator);
  }

  add(other: Rational): Rational {
    return Rational.fraction(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  sub(other: Rational): Rational {
    return this.add(other.neg());
  }

  mul(other: Rational): Rational {
    return Rational.fraction(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  div(other: Rational): Rational {
    return Rational.fraction(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  neg(): Rational {
    return new Rational(-this.numerator, this.denominator);
  }

  /** Exact comparison: −1, 0 or 1. */
  cmp(other: Rational): -1 | 0 | 1 {
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    return left < right ? -1 : left > right ? 1 : 0;
  }

  eq(other: Rational): boolean {
    return this.cmp(other) === 0;
  }

  lt(other: Rational): boolean {
    return this.cmp(other) < 0;
  }

  gt(other: Rational): boolean {
    return this.cmp(other) > 0;
  }

  min(other: Rational): Rational {
    return this.cmp(other) <= 0 ? this : other;
  }

  max(other: Rational): Rational {
    return this.cmp(other) >= 0 ? this : other;
  }

  /** clamp(x, lo, hi) = min(max(x, lo), hi) — SCORING §3 */
  clamp(lo: Rational, hi: Rational): Rational {
    return this.max(lo).min(hi);
  }

  isZero(): boolean {
    return this.numerator === ZERO_N;
  }

  /** Display rounding, half-up (SCORING §5: 726.15 → 726, 726.5 → 727). */
  roundHalfUp(): number {
    // floor(x + 1/2) = floor((2n + d) / 2d); BigInt division truncates toward zero, so
    // correct the result for negative values.
    const num = TWO_N * this.numerator + this.denominator;
    const den = TWO_N * this.denominator;
    let q = num / den;
    if (num % den !== ZERO_N && num < ZERO_N) q -= ONE_N;
    return Number(q);
  }

  /**
   * Decimal string with `scale` fraction digits, rounded half-up — for storage in
   * `numeric(8,4)` columns at close (M6). Never used for ranking.
   */
  toFixed(scale: number): string {
    const factor = TEN_N ** BigInt(scale);
    const scaled = Rational.fraction(this.numerator * factor, this.denominator).roundHalfUp();
    const negative = scaled < 0;
    const digits = String(Math.abs(scaled)).padStart(scale + 1, "0");
    const body = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    return negative ? `-${body}` : body;
  }

  /** Approximate number — for display and test assertions only, never for ranking. */
  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  toString(): string {
    return this.denominator === ONE_N ? `${this.numerator}` : `${this.numerator}/${this.denominator}`;
  }
}

export function sum(values: readonly Rational[]): Rational {
  return values.reduce((total, value) => total.add(value), Rational.ZERO);
}
