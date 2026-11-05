import React, { useState } from "react";
import {
  Smartphone, Laptop, Camera, Headphones, Speaker, Tv, HardDrive, Router, Printer,
  Gamepad2, House, Watch, Cable, BatteryCharging, Cpu
} from "lucide-react";

const P = (icon, from, to, ink) => ({ icon, from, to, ink });
const META = {
  "Phones": P(Smartphone, "#e6e4ff", "#cfd8ff", "#5a53ce"),
  "Laptops": P(Laptop, "#e4eefc", "#d3e6f7", "#3f78b5"),
  "Cameras": P(Camera, "#ffe9ee", "#fbd9e4", "#c2476b"),
  "Headphones": P(Headphones, "#f1e8ff", "#e0d4fb", "#7a4fd0"),
  "Speakers": P(Speaker, "#fff0e1", "#fde0c8", "#c9782f"),
  "TV & Display": P(Tv, "#e3f6ee", "#d2efe2", "#2f9a72"),
  "Storage": P(HardDrive, "#eef0f6", "#e2e5ee", "#6c7181"),
  "Networking": P(Router, "#e4f4fa", "#d0eaf5", "#2f86a8"),
  "Printers & Scanners": P(Printer, "#fdf6dc", "#f6ecc0", "#a88a1e"),
  "Gaming": P(Gamepad2, "#f5e6fb", "#ebd2f7", "#a248c4"),
  "Smart Home": P(House, "#e3f6ee", "#d2efe2", "#2f9a72"),
  "Wearables": P(Watch, "#ffe9ee", "#fbd9e4", "#c2476b"),
  "Chargers & Cables": P(Cable, "#fff0e1", "#fde0c8", "#c9782f"),
  "Power & Batteries": P(BatteryCharging, "#e6f7e0", "#d3efc9", "#4f9a2f"),
  default: P(Cpu, "#eef0f6", "#e2e5ee", "#6c7181"),
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
