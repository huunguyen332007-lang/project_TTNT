const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatPrice = (n) => usd.format(Number(n) || 0);

// 1200 -> "1.2k", 100000 -> "100k"
export const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".0", "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".0", "")}k`;
  return `${n}`;
};
