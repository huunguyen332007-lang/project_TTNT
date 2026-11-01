export default function CategoryTabs({ categories, value, onChange }) {
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const options = [{ name: '', label: 'Tất cả', count: total }, ...categories.map((c) => ({ name: c.name, label: c.name, count: c.count }))];

  return (
    <nav className="tabs" aria-label="Lọc theo danh mục">
      <ul className="tabs__list">
        {options.map((option) => (
          <li key={option.name || 'all'}>
            <button
              type="button"
              className={`tab${value === option.name ? ' is-active' : ''}`}
              aria-pressed={value === option.name}
              onClick={() => onChange(option.name)}
            >
              <span className="tab__label">{option.label}</span>
              <span className="tab__count">{option.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
