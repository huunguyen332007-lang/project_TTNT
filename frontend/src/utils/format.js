const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const formatPrice = (value) => vnd.format(value);

/** cosine similarity (0..1) -> phần trăm nguyên, kẹp trong 0..100. */
export const toPercent = (similarity) => Math.max(0, Math.min(100, Math.round(similarity * 100)));
