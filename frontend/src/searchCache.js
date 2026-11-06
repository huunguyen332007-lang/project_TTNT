const DB_NAME = "pickforyou-search-cache";
const STORE = "requests";
const DB_VERSION = 1;
const MAX_SAVED = 30; // giữ tối đa chừng này tìm kiếm riêng biệt (ảnh tìm kiếm là Blob nên không để phình mãi)
const TYPING_WINDOW_MS = 10_000;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB không khả dụng"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Cùng một tìm kiếm (cùng từ khóa hoặc cùng ảnh, cùng danh mục) chỉ lưu một bản. */
export function searchKey(entry) {
  const category = entry.category || "Tất cả";
  if (entry.kind === "image") return `image|${entry.imageName || ""}|${entry.imageBlob?.size ?? 0}|${category}`;
  return `text|${(entry.query || "").trim().toLowerCase()}|${category}`;
}

/**
 * Khi gõ dở "áo", "áo th", "áo thun" thì chỉ "áo thun" đáng lưu: bỏ các bản ghi cũ là phần đầu của từ khóa
 * mới nếu chúng vừa được lưu cách đây vài giây.
 */
function isTypingPrefix(old, entry, now) {
  if (old.kind !== "text" || entry.kind !== "text") return false;
  if ((old.category || "Tất cả") !== (entry.category || "Tất cả")) return false;
  if (now - old.createdAt > TYPING_WINDOW_MS) return false;
  const a = (old.query || "").trim().toLowerCase();
  const b = (entry.query || "").trim().toLowerCase();
  return a.length > 0 && a.length < b.length && b.startsWith(a);
}

export async function saveSearchRequest(entry) {
  if (!entry?.result?.items?.length) return; // tìm không ra gì thì không đáng nhớ
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = searchKey(entry);
      const now = Date.now();
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = all.result;
        const previous = rows.find((r) => (r.key || searchKey(r)) === key);
        const remaining = [];
        for (const r of rows) {
          if ((r.key || searchKey(r)) === key || isTypingPrefix(r, entry, now)) store.delete(r.id);
          else remaining.push(r);
        }
        remaining.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id).slice(MAX_SAVED - 1).forEach((r) => store.delete(r.id));
        store.add({ ...entry, key, count: (previous?.count || 0) + 1, createdAt: now });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("Không thể lưu lịch sử tìm kiếm trên thiết bị:", error);
  }
}

/** Các tìm kiếm riêng biệt gần nhất (mới nhất trước), dùng để hiển thị khi vào lại ứng dụng. */
export async function getRecentSearches(limit = 3) {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const seen = new Set();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      .filter((r) => {
        const key = r.key || searchKey(r);
        if (seen.has(key) || !r.result?.items?.length) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  } catch (error) {
    console.warn("Không thể đọc lịch sử tìm kiếm trên thiết bị:", error);
    return [];
  }
}

export async function clearSearchRequests() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("Không thể xóa lịch sử tìm kiếm:", error);
  }
}
