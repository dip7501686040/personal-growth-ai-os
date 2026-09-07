let cachedRate: number | null = null;

/** USD→INR, live (free, no key) with a sane fallback. Cached per process. */
export async function usdInrRate(): Promise<number> {
  if (cachedRate) return cachedRate;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    const j = (await res.json()) as { rates?: { INR?: number } };
    cachedRate = j.rates?.INR && j.rates.INR > 50 ? j.rates.INR : 83;
  } catch {
    cachedRate = 83;
  }
  return cachedRate;
}

const NUM = /([\d][\d,.]*)\s*([kKmM]?)/g;

/** Parse a free-text salary string → annual LPA-equivalent (INR lakhs/year),
 *  taking the midpoint of a range. Returns null when nothing usable is found. */
export function salaryToLpa(text: string | null, usdInr: number): number | null {
  if (!text) return null;
  const t = text.replace(/–|—/g, "-").toLowerCase();

  // currency + unit hints
  const inr = /₹|inr|rs\.?|lpa|lakh|per annum in india/.test(t);
  const eur = /€|eur/.test(t);
  const gbp = /£|gbp/.test(t);
  const perHour = /\/\s*(hr|hour)|per hour|hourly/.test(t);
  const perMonth = /\/\s*(mo|month)|per month|monthly|pm\b/.test(t);
  const lpaUnit = /lpa|lakh/.test(t);

  const nums: number[] = [];
  let m: RegExpExecArray | null;
  NUM.lastIndex = 0;
  while ((m = NUM.exec(t))) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const suf = m[2].toLowerCase();
    if (suf === "k") n *= 1_000;
    if (suf === "m") n *= 1_000_000;
    nums.push(n);
  }
  const plausible = nums.filter((n) => n >= (lpaUnit ? 1 : 1_000));
  if (plausible.length === 0) return null;

  const lo = Math.min(...plausible);
  const hi = Math.max(...plausible);
  let mid = (lo + hi) / 2;

  if (lpaUnit) return round1(mid); // already in lakhs/year

  // annualize
  if (perHour) mid *= 2080;
  else if (perMonth) mid *= 12;

  // to INR
  if (inr) {
    /* already INR */
  } else if (eur) mid *= usdInr * 1.08;
  else if (gbp) mid *= usdInr * 1.27;
  else mid *= usdInr; // assume USD

  return round1(mid / 100_000);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
