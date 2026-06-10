import { useEffect, useState } from "react";

import Chat from "../Chat";
import Graph from "../Graph";

const ENTITY_TYPES = [
  { color: "#3478f6", count: 25, label: "Customers", type: "business_partner" },
  { color: "#20b486", count: 89, label: "Sales Orders", type: "sales_order" },
  { color: "#9b5de5", count: 24, label: "Products", type: "product" },
  { color: "#ff8a1f", count: 25, label: "Deliveries", type: "delivery" },
  { color: "#f04444", count: 77, label: "Invoices", type: "billing" },
  { color: "#22b8c7", count: 51, label: "Payments", type: "payment" },
  { color: "#6755cc", count: 75, label: "Journal Entries", type: "accounting" },
];

const ANALYTICS = [
  { change: "▲ 12.5%", label: "Orders Created", note: "vs last 30 days", tone: "up", value: "1,254" },
  { change: "▲ 8.2%", label: "Invoices Generated", note: "vs last 30 days", tone: "up", value: "1,190" },
  { change: "▲ 9.1%", label: "Payments Received", note: "vs last 30 days", tone: "up", value: "1,139" },
  { change: "▼ 3.7%", label: "Pending Invoices", note: "vs last 30 days", tone: "down", value: "51" },
  { change: "◆ 6.4%", label: "Average Cycle Time", note: "vs last 30 days", tone: "down", value: "4.3 days" },
  { change: "▲ 15.3%", label: "Revenue at Risk", note: "vs last 30 days", tone: "up", value: "₹2.34M" },
  { label: "Top Delayed Customers", link: "View list", value: "7" },
  { label: "Payment Bottlenecks", link: "View details", value: "3" },
];

const DETAIL_TABS = ["Overview", "Relationships", "Timeline", "Insights", "Raw Data"];

function Icon({ name, size = 16 }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    collapse: <><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4-2v-4L4 5z" />,
    fullscreen: <><path d="M8 3H3v5" /><path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M16 21h5v-5" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1.1.9-1.1 1.7" /><path d="M12 17h.01" /></>,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    layout: <><circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7.7 8.1 3.2 7.8M16.3 8.1l-3.2 7.8" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1 1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1-1" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" /><path d="M9 3v15M15 6v15" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    overview: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M9 10h11" /></>,
    path: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M7.5 16.5 16.5 7.5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    spark: <><path d="m12 3-1.3 4.1a5 5 0 0 1-3.2 3.2L3 12l4.5 1.7a5 5 0 0 1 3.2 3.2L12 21l1.3-4.1a5 5 0 0 1 3.2-3.2L21 12l-4.5-1.7a5 5 0 0 1-3.2-3.2L12 3z" /></>,
    x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  };

  return (
    <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width={size}>
      {paths[name]}
    </svg>
  );
}

function formatLabel(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function Sidebar({ collapsed, hiddenTypes, onToggle, onToggleType }) {
  return (
    <aside className={`entity-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      {!collapsed ? (
        <>
          <nav className="primary-nav">
            <button type="button"><Icon name="overview" /> Overview</button>
          </nav>

          <section className="sidebar-group">
            <h3>Process Explorer</h3>
            <button className="sidebar-nav-item is-active" type="button"><Icon name="path" /> Process Map</button>
            <button className="sidebar-nav-item" type="button"><Icon name="path" /> Path Finder</button>
            <button className="sidebar-nav-item" type="button"><Icon name="grid" /> Entity Explorer</button>
            <button className="sidebar-nav-item" type="button"><Icon name="bookmark" /> Bookmarks</button>
          </section>

          <section className="sidebar-group entity-type-group">
            <h3>Entity Types</h3>
            <label className="sidebar-search">
              <Icon name="search" size={14} />
              <input placeholder="Search entity types" type="search" />
            </label>
            <div className="entity-filters">
              {ENTITY_TYPES.map((entity) => (
                <label key={entity.type}>
                  <input checked={!hiddenTypes.has(entity.type)} onChange={() => onToggleType(entity.type)} type="checkbox" />
                  <span className="entity-filter__dot" style={{ background: entity.color }} />
                  <span>{entity.label}</span>
                  <small>{entity.count}</small>
                </label>
              ))}
            </div>
          </section>

          <section className="sidebar-group">
            <h3>Quick Filters</h3>
            <button className="filter-row" type="button"><Icon name="filter" /> Payment exceptions <small>12</small></button>
            <button className="filter-row" type="button"><Icon name="filter" /> Revenue at risk <small>8</small></button>
            <button className="filter-row" type="button"><Icon name="filter" /> Delayed deliveries <small>5</small></button>
          </section>

          <section className="sidebar-group recent-group">
            <h3>Recent Investigations</h3>
            <button type="button"><Icon name="history" /><span>Delayed payments - North region<small>10 Jun 2026</small></span></button>
            <button type="button"><Icon name="history" /><span>Invoice exceptions - Q2<small>9 Jun 2026</small></span></button>
            <button type="button"><Icon name="history" /><span>Customer 1000044 document flow<small>8 Jun 2026</small></span></button>
          </section>

          <button className="collapse-button" onClick={onToggle} type="button"><Icon name="collapse" /> Collapse</button>
        </>
      ) : (
        <div className="collapsed-nav">
          <button onClick={onToggle} type="button"><Icon name="chevron" /></button>
          <button type="button"><Icon name="overview" /></button>
          <button type="button"><Icon name="path" /></button>
          <button type="button"><Icon name="grid" /></button>
          <button type="button"><Icon name="bookmark" /></button>
        </div>
      )}
    </aside>
  );
}

function DetailRows({ node }) {
  const details = node?.details || {};
  const isBilling = !node || node.type === "billing";
  const rows = isBilling
    ? [
        ["Invoice Number", details.billingDocument || "INV-1204"],
        ["Customer", details.soldToParty || "ABC Industries", "link"],
        ["Amount", details.totalNetAmount ? `₹${details.totalNetAmount}` : "₹145,000.00"],
        ["Currency", details.transactionCurrency || "INR"],
        ["Status", "Pending", "status"],
        ["Created On", details.billingDocumentDate || "10 Jun 2026"],
        ["Due Date", "25 Jun 2026"],
        ["Invoice Type", details.billingDocumentType || "Standard Invoice"],
        ["Company Code", details.companyCode || "1000"],
        ["Billing Document", details.billingDocument || "INV-1204"],
        ["Fiscal Year", details.fiscalYear || "2026"],
      ]
    : Object.entries(details).slice(0, 11).map(([key, value]) => [formatLabel(key), displayValue(value)]);

  return (
    <dl className="detail-rows">
      {rows.map(([label, value, treatment]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={treatment ? `is-${treatment}` : ""}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailsPanel({ node, onAnalyze }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const title = node ? `${formatLabel(node.type)} #${node.entityId}` : "Invoice #INV-1204";

  useEffect(() => setActiveTab("Overview"), [node?.id]);

  return (
    <aside className="details-panel">
      <header className="details-header">
        <h2>{title}</h2>
        <button className="bare-icon" title="Close details" type="button"><Icon name="x" /></button>
      </header>
      <nav className="details-tabs">
        {DETAIL_TABS.map((tab) => (
          <button className={activeTab === tab ? "is-active" : ""} key={tab} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
        ))}
      </nav>

      <div className="details-content">
        {activeTab === "Overview" ? (
          <>
            <DetailRows node={node} />
            <section className="related-block">
              <header><strong>Related Orders (2)</strong><button type="button">View all</button></header>
              <a href="#order">SO-1044</a>
              <a href="#order">SO-1048</a>
            </section>
            <section className="related-block">
              <header><strong>Related Payments</strong><button type="button">View all</button></header>
              <span>2 payments</span>
              <small>₹95,000.00 received</small>
            </section>
            <section className="related-block">
              <header><strong>Connected Documents</strong><button type="button">View all</button></header>
              <span>14 documents</span>
            </section>
          </>
        ) : activeTab === "Raw Data" ? (
          <pre className="raw-data">{JSON.stringify(node?.details || {}, null, 2)}</pre>
        ) : (
          <div className="tab-placeholder">
            <Icon name={activeTab === "Relationships" ? "link" : "history"} size={24} />
            <strong>{activeTab}</strong>
            <span>Select and explore connected process data.</span>
          </div>
        )}
      </div>

      <footer className="details-footer">
        <button type="button"><Icon name="link" /> Path Finder</button>
        <button className="primary-action" onClick={onAnalyze} type="button"><Icon name="spark" /> Analyze</button>
        <button className="square-action" type="button"><Icon name="more" /></button>
      </footer>
    </aside>
  );
}

function AnalyticsStrip() {
  return (
    <section className="analytics-strip">
      <h2>Process Health Overview</h2>
      <div className="analytics-grid">
        {ANALYTICS.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <div><strong>{metric.value}</strong>{metric.change ? <small className={metric.tone}>{metric.change}</small> : null}</div>
            {metric.link ? <a href="#metric">{metric.link}</a> : <small className="metric-note">{metric.note}</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

function CommandPalette({ onClose }) {
  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <label><Icon name="search" /><input autoFocus placeholder="Search entities, orders, invoices..." /><kbd>Esc</kbd></label>
        <button type="button"><Icon name="path" /> Open Path Finder</button>
        <button type="button"><Icon name="grid" /> Browse Entity Explorer</button>
        <button type="button"><Icon name="download" /> Export current graph</button>
      </div>
    </div>
  );
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hiddenTypes, setHiddenTypes] = useState(new Set());
  const [aiOpen, setAiOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setAiOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function toggleEntityType(type) {
    setHiddenTypes((current) => {
      const next = new Set(current);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <header className="enterprise-header">
        <div className="product-brand">
          <span className="product-mark">QOS</span>
          <h1>Order-to-Cash Process Explorer</h1>
        </div>
        <div className="dataset-metadata">
          <span>Dataset: SAP ECC Production</span>
          <span>551 Entities</span>
          <span>1,089 Relationships</span>
          <span>Last sync: 2 min ago</span>
          <span className="connection-state"><i /> Connected</span>
        </div>
        <div className="header-tools">
          <button className="global-search" onClick={() => setCommandOpen(true)} type="button">
            <Icon name="search" /><span>Search entities, orders, invoices...</span><kbd>Ctrl + K</kbd>
          </button>
          <button className="header-icon" type="button"><Icon name="help" /></button>
          <button className="header-icon has-indicator" type="button"><Icon name="bell" /></button>
          <button className="user-profile" type="button">DS</button>
        </div>
      </header>

      <main className={`enterprise-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar collapsed={sidebarCollapsed} hiddenTypes={hiddenTypes} onToggle={() => setSidebarCollapsed((value) => !value)} onToggleType={toggleEntityType} />

        <section className="work-area">
          <div className="top-workspace">
            <section className="graph-workspace">
              <div className="workspace-breadcrumb"><span>Process Map</span><Icon name="chevron" size={13} /><strong>Document Relationship Graph</strong></div>
              <div className="graph-container">
                <Graph hiddenTypes={hiddenTypes} onSelectionChange={setSelectedNode} />
              </div>
            </section>
            <DetailsPanel node={selectedNode} onAnalyze={() => setAiOpen(true)} />
          </div>
          <AnalyticsStrip />
        </section>
      </main>

      <footer className="app-footer"><span>© 2026 QueryOS Technologies</span><div><a href="#privacy">Privacy Policy</a><i /> <a href="#terms">Terms of Use</a></div></footer>

      {aiOpen ? (
        <div className="ai-sheet-backdrop" onMouseDown={() => setAiOpen(false)}>
          <aside className="ai-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>Analysis Assistant</span><strong>Ask about this process</strong></div><button onClick={() => setAiOpen(false)} type="button"><Icon name="x" /></button></header>
            <Chat />
          </aside>
        </div>
      ) : null}
      {commandOpen ? <CommandPalette onClose={() => setCommandOpen(false)} /> : null}
    </div>
  );
}
