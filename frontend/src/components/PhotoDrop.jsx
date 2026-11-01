import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { ACCEPTED_TYPES, validateImage } from '../utils/image.js';

/**
 * Khung ngắm (viewfinder) để thả/chọn/dán ảnh. Bốn góc khung "khóa" vào ảnh khi đã chọn xong.
 */
export default function PhotoDrop({ file, onPick, onClear, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  // Tạo URL xem trước trong effect (không dùng useMemo) để đúng cả khi StrictMode chạy effect hai lần.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = useCallback(
    (candidate) => {
      if (!candidate || disabled) return;
      const error = validateImage(candidate);
      setProblem(error);
      if (!error) onPick(candidate);
    },
    [onPick, disabled],
  );

  // Dán ảnh từ clipboard (Ctrl+V) ở bất kỳ đâu trên trang; dán văn bản vẫn hoạt động bình thường.
  useEffect(() => {
    const onPaste = (event) => {
      const image = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (image) {
        event.preventDefault();
        pick(image);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [pick]);

  return (
    <div
      className={`photo-drop${dragging ? ' is-over' : ''}${file ? ' has-photo' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="photo-drop__frame">
        <span className="corner corner--tl" aria-hidden="true" />
        <span className="corner corner--tr" aria-hidden="true" />
        <span className="corner corner--bl" aria-hidden="true" />
        <span className="corner corner--br" aria-hidden="true" />
        {previewUrl ? (
          <img className="photo-drop__preview" src={previewUrl} alt="Ảnh bạn đã chọn để tìm sản phẩm" />
        ) : (
          <div className="photo-drop__prompt">
            <Upload size={28} aria-hidden="true" />
            <p className="photo-drop__title">Thả ảnh vào đây</p>
            <p className="photo-drop__hint">hoặc dán ảnh bằng Ctrl+V</p>
          </div>
        )}
      </div>

      <div className="photo-drop__actions">
        <button type="button" className="btn btn--outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {file ? 'Đổi ảnh' : 'Chọn ảnh từ máy'}
        </button>
        {file && (
          <button type="button" className="btn btn--text" onClick={onClear}>
            <X size={16} aria-hidden="true" /> Bỏ ảnh
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ''; // cho phép chọn lại đúng tệp vừa chọn
        }}
      />
      <p className="photo-drop__problem" role="alert">{problem}</p>
    </div>
  );
}
