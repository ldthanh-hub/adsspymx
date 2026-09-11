import Link from "next/link";

export default function Layout({ active, headerRight, children }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">MX</span>
          <div>
            <h1>Ad Spy</h1>
            <p>Theo dõi quảng cáo mỹ phẩm đối thủ tại Mexico</p>
          </div>
        </div>

        <nav className="nav-tabs">
          <Link href="/" className={active === "ads" ? "active" : ""}>
            Quảng cáo
          </Link>
          <Link href="/brands" className={active === "brands" ? "active" : ""}>
            Dashboard Brand
          </Link>
        </nav>

        <div className="header-right">{headerRight}</div>
      </header>

      {children}

      <style jsx global>{`
        :root {
          color-scheme: light;
        }
        html,
        body {
          margin: 0;
          padding: 0;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <style jsx>{`
        .app {
          min-height: 100vh;
          background: #f4f5fb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1c1d2b;
        }

        .topbar {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 14px 24px;
          background: #14152b;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
        }
        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6c5ce7, #a29bfe);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          color: #fff;
          flex-shrink: 0;
        }
        .brand h1 {
          font-size: 16px;
          margin: 0;
          color: #fff;
          line-height: 1.2;
        }
        .brand p {
          font-size: 11.5px;
          margin: 0;
          color: #9799b8;
        }

        .nav-tabs {
          display: flex;
          gap: 4px;
          background: #1e1f3a;
          padding: 4px;
          border-radius: 9px;
          flex-shrink: 0;
        }
        .nav-tabs :global(a) {
          font-size: 12.5px;
          font-weight: 600;
          color: #9799b8;
          text-decoration: none;
          padding: 7px 12px;
          border-radius: 7px;
          white-space: nowrap;
        }
        .nav-tabs :global(a.active) {
          background: #6c5ce7;
          color: #fff;
        }

        .header-right {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: flex-end;
        }

        @media (max-width: 900px) {
          .brand p {
            display: none;
          }
          .topbar {
            flex-wrap: wrap;
            row-gap: 10px;
            padding: 12px 16px;
          }
          .header-right {
            order: 3;
            flex-basis: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
