// Khóa phải khớp BUDGETS ở backend/src/config/constants.js (mốc tính theo VND, chọn theo phân phối giá thật).
export const budgetOptions = [
  { key: "any", label: "Bất kỳ" },
  { key: "low", label: "Dưới 100k" },
  { key: "mid", label: "100k – 300k" },
  { key: "high", label: "300k – 1 triệu" },
  { key: "premium", label: "Trên 1 triệu" },
];
