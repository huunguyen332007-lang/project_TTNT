// Gợi ý theo nội dung (content-based) chạy ngay trên trình duyệt.
// Dùng làm bản dự phòng khi chưa có backend / model thật.

export const fold = (s = "") =>
  s.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

// Ngân sách theo USD (dữ liệu Amazon)
export const budgetOptions = [
  { key: "any", label: "Bất kỳ", range: null },
  { key: "low", label: "Dưới $25", range: [0, 25] },
  { key: "mid", label: "$25 – $100", range: [25, 100] },
  { key: "high", label: "$100 – $500", range: [100, 500] },
  { key: "premium", label: "Trên $500", range: [500, Infinity] },
];

const WEIGHTS = { text: 0.35, interest: 0.18, viewedCat: 0.12, tag: 0.1, budget: 0.1, popular: 0.15 };

const split = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
// Tiêu đề + tag đáng tin hơn nhãn danh mục (nhãn trong dữ liệu Amazon có chỗ gán nhầm)
const titleWords = (p) => split([p.name, ...(p.tags || [])].join(" "));
const metaWords = (p) => split([p.category, p.brand].join(" "));

// Dữ liệu sản phẩm bằng tiếng Anh, giao diện tiếng Việt -> dịch nhanh các từ khóa phổ biến.
// Khóa viết không dấu. Mỗi từ tiếng Việt ứng với nhiều từ tiếng Anh (khớp 1 trong số đó là được).
const VI_EN = {
  "tai nghe": ["headphones", "earbuds", "headset"],
  "dien thoai": ["phone", "smartphone", "iphone"],
  "may anh": ["camera"],
  "loa": ["speaker", "soundbar"],
  "sac": ["charger", "charging"],
  "cap": ["cable"],
  "ban phim": ["keyboard"],
  "chuot": ["mouse"],
  "dong ho": ["watch", "smartwatch"],
  "man hinh": ["monitor", "display"],
  "tivi": ["tv", "television"],
  "ti vi": ["tv", "television"],
  "may in": ["printer"],
  "o cung": ["ssd", "drive", "storage"],
  "the nho": ["sd", "memory"],
  "pin": ["battery", "batteries"],
  "may tinh xach tay": ["laptop"],
  "may tinh": ["computer", "laptop"],
  "choi game": ["gaming", "game"],
  "may choi game": ["gaming", "console"],
  "nha thong minh": ["smart", "home"],
  "wifi": ["wifi", "router"],
  "khong day": ["wireless"],
  "chong on": ["noise", "cancelling"],
  "gia re": ["budget"],
};

// "tai nghe khong day" -> [[headphones|earbuds|headset], [wireless]]  (mỗi nhóm khớp 1 từ là tính)
function parseQuery(query) {
  const toks = fold(query).split(/\s+/).filter(Boolean);
  const groups = [];
  for (let i = 0; i < toks.length; ) {
    let hit = false;
    for (let n = Math.min(4, toks.length - i); n >= 1; n--) {
      const alts = VI_EN[toks.slice(i, i + n).join(" ")];
      if (alts) { groups.push(alts); i += n; hit = true; break; }
    }
    if (!hit) groups.push([toks[i++]]);
  }
  return groups;
}

export function recommend(products, { query = "", category = "Tất cả", interests = [], budget = "any", viewed = [] }) {
  const groups = parseQuery(query);
  const range = budgetOptions.find((b) => b.key === budget)?.range;

  const viewedCat = {};
  viewed.forEach((v) => (viewedCat[v.category] = (viewedCat[v.category] || 0) + 1));
  const viewedTags = new Set(viewed.flatMap((v) => (v.tags || []).map(fold)));

  const out = [];
  for (const p of products) {
    if (category !== "Tất cả" && p.category !== category) continue;

    let text = 0;
    if (groups.length) {
      // Khớp theo đầu từ: "lap" khớp "laptop", nhưng "on" không khớp "con"
      // Mỗi nhóm từ: khớp tiêu đề/tag = 0.7, khớp danh mục/thương hiệu = +0.3
      const tw = titleWords(p), mw = metaWords(p);
      const hit = (alts, ws) => alts.some((t) => ws.some((w) => w.startsWith(t)));
      text = groups.reduce((sum, alts) => sum + (hit(alts, tw) ? 0.7 : 0) + (hit(alts, mw) ? 0.3 : 0), 0) / groups.length;
      if (text === 0) continue;
    }

    const interest = interests.includes(p.category) ? 1 : 0;
    const vCat = viewed.length ? (viewedCat[p.category] || 0) / viewed.length : 0;
    const tags = (p.tags || []).map(fold);
    const tag = tags.length ? tags.filter((t) => viewedTags.has(t)).length / tags.length : 0;
    const budgetFit = range && p.price >= range[0] && p.price < range[1] ? 1 : 0;
    // Độ phổ biến: điểm đánh giá + số lượt đánh giá (thang log vì chênh lệch rất lớn)
    const popular = 0.6 * (p.rating / 5) + 0.4 * Math.min(1, Math.log1p(p.reviews || 0) / Math.log1p(10000));

    const score =
      WEIGHTS.text * text + WEIGHTS.interest * interest + WEIGHTS.viewedCat * vCat +
      WEIGHTS.tag * tag + WEIGHTS.budget * budgetFit + WEIGHTS.popular * popular;

    let reason = p.badge ? p.badge : p.rating >= 4.6 ? "Được đánh giá cao" : "Được nhiều người chọn";
    if (budgetFit) reason = "Hợp ngân sách của bạn";
    if (interest) reason = `Vì bạn quan tâm ${p.category}`;
    if (tag > 0) reason = "Giống sản phẩm bạn đã xem";
    if (text > 0) reason = `Khớp từ khóa “${query.trim()}”`;

    out.push({ ...p, score, reason });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Sản phẩm tương tự: Jaccard trên tag + thưởng nếu cùng danh mục.
export function similarTo(product, pool, n = 3) {
  const a = new Set((product.tags || []).map(fold));
  return pool
    .filter((p) => p.id !== product.id)
    .map((p) => {
      const b = new Set((p.tags || []).map(fold));
      const inter = [...a].filter((t) => b.has(t)).length;
      const union = new Set([...a, ...b]).size || 1;
      return { p, s: 0.6 * (inter / union) + 0.4 * (p.category === product.category ? 1 : 0) };
    })
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.p);
}
