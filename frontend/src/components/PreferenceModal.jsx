import React, { useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { budgetOptions } from "../recommender.js";

export default function PreferenceModal({ categories, interests, budget, onSave, onClose }) {
  const [draftInterests, setDraftInterests] = useState(interests);
  const [draftBudget, setDraftBudget] = useState(budget);
  const toggle = (c) => setDraftInterests((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="pref-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        <div className="modal-icon"><SlidersHorizontal size={24} /></div>
        <div className="section-kicker">CÁ NHÂN HÓA GỢI Ý</div>
        <h2 id="pref-title">Bạn quan tâm điều gì?</h2>
        <p>Chọn danh mục và ngân sách để chúng tôi gợi ý đúng hơn. Bạn có thể đổi bất cứ lúc nào.</p>

        <div className="field-label">DANH MỤC YÊU THÍCH</div>
        <div className="chip-wrap">
          {categories.map((c) => (
            <button key={c} type="button" className={`category-chip ${draftInterests.includes(c) ? "selected" : ""}`} onClick={() => toggle(c)}>{c}</button>
          ))}
        </div>

        <div className="field-label">NGÂN SÁCH</div>
        <div className="chip-wrap">
          {budgetOptions.map((b) => (
            <button key={b.key} type="button" className={`category-chip ${draftBudget === b.key ? "selected" : ""}`} onClick={() => setDraftBudget(b.key)}>{b.label}</button>
          ))}
        </div>

        <button className="primary-btn" onClick={() => onSave(draftInterests, draftBudget)}>Lưu và xem gợi ý</button>
        <button className="modal-cancel" onClick={() => { setDraftInterests([]); setDraftBudget("any"); }}>Đặt lại</button>
        <small className="privacy-note">Sở thích chỉ được lưu trên trình duyệt này.</small>
      </div>
    </div>
  );
}
