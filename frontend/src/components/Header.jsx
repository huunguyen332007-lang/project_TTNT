const STATUS = {
  ok: { tone: 'ok', label: 'Tìm bằng AI: sẵn sàng' },
  degraded: { tone: 'warn', label: 'AI tạm ngưng, đang tìm theo từ khóa' },
  error: { tone: 'bad', label: 'Không kết nối được máy chủ' },
  unknown: { tone: 'idle', label: 'Đang kiểm tra hệ thống' },
};

function Logo() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <path d="M8 13V8h5M19 8h5v5M24 19v5h-5M13 24H8v-5" stroke="var(--focus)" strokeWidth="2.4" strokeLinecap="square" fill="none" />
      <circle cx="16" cy="16" r="2.6" fill="var(--focus)" />
    </svg>
  );
}

export default function Header({ health, onHome }) {
  const status = STATUS[health] ?? STATUS.unknown;
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); onHome(); }}>
          <Logo />
          <span className="brand__name">MachineSearch</span>
        </a>
        <p className={`status status--${status.tone}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          {status.label}
        </p>
      </div>
    </header>
  );
}
