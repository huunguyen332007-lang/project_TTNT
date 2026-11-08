import React, { useRef, useState } from "react";
import { X, Camera, ImagePlus } from "lucide-react";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_MB = 5; // khớp MAX_UPLOAD_MB mặc định của backend; backend vẫn là nơi quyết định cuối cùng

export default function ImageSearchModal({ onPick, onClose }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  function choose(file) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Ảnh lớn hơn ${MAX_MB} MB, hãy chọn ảnh nhỏ hơn.`);
    onPick(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="img-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        <div className="modal-icon"><Camera size={24} /></div>
        <div className="section-kicker">TÌM BẰNG ẢNH</div>
        <h2 id="img-title">Tải ảnh lên để tìm sản phẩm giống</h2>
        <p>Chọn ảnh một sản phẩm bạn thích, hệ thống sẽ tìm những sản phẩm có hình ảnh gần nhất. Ảnh chỉ dùng để tìm kiếm.</p>

        <button
          type="button"
          className="modal-dropzone"
          style={dragging ? { borderColor: "#7a72dd", background: "#f5f4ff" } : undefined}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
        >
          <ImagePlus size={26} />
          <strong style={{ marginTop: 10 }}>Chọn ảnh hoặc kéo thả vào đây</strong>
          <span className="modal-file-types">JPG · PNG · WEBP · GIF · TỐI ĐA {MAX_MB} MB</span>
        </button>
        <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        {error && <p role="alert" className="modal-error">{error}</p>}

        <button className="modal-cancel" onClick={onClose}>Hủy</button>
      </div>
    </div>
  );
}
