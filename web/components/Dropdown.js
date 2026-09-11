import { useEffect, useRef, useState } from "react";

// Dropdown dùng chung cho các bộ lọc dạng "tick chọn nhiều" (Ngành hàng, Thương hiệu) — thay cho
// danh sách checkbox luôn xổ ra dài lê thê ở sidebar cũ. Đóng khi bấm ra ngoài hoặc nhấn Esc.
// Tất cả CSS của các phần tử BÊN TRONG panel đều viết trong CHÍNH file này (không phải ở file gọi
// nó) — tránh đúng lỗi styled-jsx "scoped" từng gặp trước đây (style jsx ở component cha không áp
// dụng được vào JSX của component con).
export default function Dropdown({ label, count, children, align = "left", width = 280 }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={rootRef}>
      <button type="button" className={`dropdown-trigger ${count ? "has-value" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        {count > 0 && <span className="dropdown-badge">{count}</span>}
        <svg className={`chevron ${open ? "up" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={`dropdown-panel align-${align}`} style={{ width }}>
          {children}
        </div>
      )}

      <style jsx>{`
        .dropdown {
          position: relative;
        }
        .dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #23244a;
          color: #c6c7e0;
          border: 1px solid transparent;
          padding: 8px 12px;
          border-radius: 9px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .dropdown-trigger:hover {
          border-color: #3a3c68;
        }
        .dropdown-trigger.has-value {
          background: #2b2c5c;
          color: #fff;
        }
        .dropdown-badge {
          background: #6c5ce7;
          color: #fff;
          border-radius: 20px;
          padding: 1px 6px;
          font-size: 10.5px;
          font-weight: 700;
        }
        .chevron {
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }
        .chevron.up {
          transform: rotate(180deg);
        }

        .dropdown-panel {
          position: absolute;
          top: calc(100% + 6px);
          z-index: 40;
          background: #fff;
          border: 1px solid #ebecf5;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(20, 21, 43, 0.18);
          padding: 10px;
          max-width: calc(100vw - 32px);
        }
        .dropdown-panel.align-left {
          left: 0;
        }
        .dropdown-panel.align-right {
          right: 0;
        }
      `}</style>
    </div>
  );
}
