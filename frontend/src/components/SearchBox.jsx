import { Search, X } from 'lucide-react';

export default function SearchBox({ value, onChange, onSubmit, busy }) {
  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <label className="visually-hidden" htmlFor="search-input">Mô tả sản phẩm bạn cần</label>
      <Search className="search-box__icon" size={20} aria-hidden="true" />
      <input
        id="search-input"
        className="search-box__input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ví dụ: góc đọc sách có ánh sáng tự nhiên"
        autoComplete="off"
        maxLength={250}
      />
      {value && (
        <button type="button" className="icon-btn" aria-label="Xóa nội dung" onClick={() => onChange('')}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
      <button type="submit" className="btn btn--shutter" disabled={!value.trim() || busy}>
        Tìm sản phẩm
      </button>
    </form>
  );
}
