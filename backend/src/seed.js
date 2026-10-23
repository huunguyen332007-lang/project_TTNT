import { productsPool } from './db.js';

const seedProducts = [
  { title: 'Không gian làm việc tối giản', category: 'Thiết kế', tag: 'INSPIRATION', image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=85', description: 'Ánh sáng tự nhiên, bàn gỗ sáng và những chi tiết vừa đủ.' },
  { title: 'Kiến trúc với đường nét mềm', category: 'Kiến trúc', tag: 'ARCHITECTURE', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85', description: 'Một góc không gian yên tĩnh với chất liệu tự nhiên.' },
  { title: 'Bảng màu dịu nhẹ', category: 'Màu sắc', tag: 'COLOR STUDY', image: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=85', description: 'Trắng kem, be và nâu tạo cảm giác ấm áp, cân bằng.' },
  { title: 'Thiết kế sản phẩm hiện đại', category: 'Sản phẩm', tag: 'PRODUCT', image: 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=900&q=85', description: 'Hình khối gọn gàng và công năng được đặt lên trước.' },
  { title: 'Góc đọc sách bên cửa sổ', category: 'Lối sống', tag: 'SLOW LIVING', image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=85', description: 'Một khoảng nghỉ nhỏ dành cho đọc sách và suy nghĩ.' },
  { title: 'Cảm hứng từ thiên nhiên', category: 'Thiên nhiên', tag: 'NATURE', image: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85', description: 'Sắc xanh và ánh nắng tạo nên bảng màu giàu năng lượng.' }
];

export async function seedIfEmpty() {
  const { rows } = await productsPool.query('SELECT COUNT(*)::int AS count FROM products');
  if (rows[0].count > 0) return;
  for (const p of seedProducts) {
    await productsPool.query(
      'INSERT INTO products (title, category, tag, image, description) VALUES ($1,$2,$3,$4,$5)',
      [p.title, p.category, p.tag, p.image, p.description]
    );
  }
  console.log(`[api] đã thêm ${seedProducts.length} sản phẩm mẫu`);
}
