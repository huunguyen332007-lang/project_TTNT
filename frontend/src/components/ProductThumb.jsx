import React, { useState } from "react";
import {
  Shirt, Footprints, ShoppingBag, Smartphone, BatteryCharging, Headphones, Sparkles, House, BookOpen, Dumbbell, Package,
} from "lucide-react";

const P = (icon, from, to, ink) => ({ icon, from, to, ink });
// Khóa = danh mục do backend trả về (xem backend/src/db/seed-data/category-map.json).
const META = {
  "Thời trang": P(Shirt, "#ffe9ee", "#fbd9e4", "#c2476b"),
  "Giày dép": P(Footprints, "#fff0e1", "#fde0c8", "#c9782f"),
  "Túi xách & Balo": P(ShoppingBag, "#f1e8ff", "#e0d4fb", "#7a4fd0"),
  "Điện thoại & Máy tính bảng": P(Smartphone, "#e6e4ff", "#cfd8ff", "#5a53ce"),
  "Sạc & Phụ kiện điện thoại": P(BatteryCharging, "#e6f7e0", "#d3efc9", "#4f9a2f"),
  "Âm thanh & Công nghệ": P(Headphones, "#e4eefc", "#d3e6f7", "#3f78b5"),
  "Làm đẹp": P(Sparkles, "#f5e6fb", "#ebd2f7", "#a248c4"),
  "Nhà cửa & Đời sống": P(House, "#e3f6ee", "#d2efe2", "#2f9a72"),
  "Sách & Văn phòng phẩm": P(BookOpen, "#fdf6dc", "#f6ecc0", "#a88a1e"),
  "Thể thao": P(Dumbbell, "#e4f4fa", "#d0eaf5", "#2f86a8"),
  default: P(Package, "#eef0f6", "#e2e5ee", "#6c7181"),
};

// Có ảnh thật thì hiển thị; ảnh lỗi/không tải được thì rơi về icon theo danh mục.
export default function ProductThumb({ product, size = 44 }) {
  const [failed, setFailed] = useState(false);
  if (product.image && !failed) {
    return (
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  const m = META[product.category] || META.default;
  const Icon = m.icon;
  return (
    <div className="thumb-fallback" style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})`, color: m.ink }}>
      <Icon size={size} strokeWidth={1.5} />
    </div>
  );
}
