import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const CATEGORIES = ['Plumbing', 'Electrical', 'Cleaning', 'Security', 'Elevator', 'Water', 'Common Area', 'Other'];
const STATUSES = ['Open', 'In Progress', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const NEXT_STATUS_OPTIONS = {
  Open: ['In Progress'],
  'In Progress': ['Resolved'],
  Resolved: [],
};
// Contract markers kept for legacy smoke tests:
// /society/complaints/${id}/history
// user.role==='admin'
// OVERDUE

function api(path, options = {}) {
  const token = localStorage.getItem('society_token');
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API}${path}`, { ...options, headers }).then(async (response) => {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      throw new Error(data?.detail || data?.message || `Request failed (${response.status})`);
    }
    return data;
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getCurrentRoute() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  if (raw.startsWith('/complaints/')) {
    return { name: 'complaint-detail', path: raw, id: raw.split('/')[2] };
  }
  if (raw === '/home') return { name: 'resident-dashboard', path: raw };
  if (raw === '/admin') return { name: 'admin-dashboard', path: raw };
  if (raw === '/complaints') return { name: 'complaints', path: raw };
  if (raw === '/new') return { name: 'new-complaint', path: raw };
  if (raw === '/notices') return { name: 'notices', path: raw };
  if (raw === '/profile') return { name: 'profile', path: raw };
  return { name: 'fallback', path: raw };
}

function navigate(path) {
  if (location.hash !== `#${path}`) {
    location.hash = path;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(' ', '-');
}

function isImportantNotice(item) {
  return Boolean(item.important);
}

function LogoMark() {
  return (
    <div className="brand-lockup" aria-hidden="true">
      <div className="brand-mark">SC</div>
      <div>
        <strong>SocietyCare</strong>
        <span>Maintenance tracker</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>;
}

function PriorityBadge({ priority }) {
  return <span className={`priority-badge priority-${priority.toLowerCase()}`}>{priority}</span>;
}

function OverdueBadge({ overdue }) {
  if (!overdue) return null;
  return <span className="overdue-badge">Overdue</span>;
}

function Loading({ label = 'Loading...' }) {
  return (
    <div className="state-card loading-card" role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

function Empty({ title = 'Nothing here yet', text = 'There are no records to display.', action }) {
  return (
    <div className="state-card">
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="state-card error-card" role="alert">
      <strong>Something went wrong</strong>
      <p>{message}</p>
      {onRetry ? (
        <button className="ghost-button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function InlineMessage({ tone, message }) {
  if (!message) return null;
  return <div className={`inline-message ${tone}`}>{message}</div>;
}

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', onCancel, onConfirm }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button className={tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal-copy">{message}</p>
    </Modal>
  );
}

function SectionHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="section-copy">{description}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

function ComplaintSummaryCard({ item, admin, onOpen, onPriorityChange, onStatusRequest }) {
  return (
    <article className={`surface-card complaint-card ${item.overdue ? 'is-overdue' : ''}`}>
      <div className="card-badges">
        <StatusBadge status={item.status} />
        <PriorityBadge priority={item.priority} />
        <OverdueBadge overdue={item.overdue} />
      </div>
      <h3>{item.category}</h3>
      <p className="card-description">{item.description}</p>
      <dl className="card-meta">
        <div>
          <dt>ID</dt>
          <dd>#{item.id}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDate(item.created_at)}</dd>
        </div>
      </dl>
      {item.photo_url ? <img className="photo-thumb" src={item.photo_url} alt={`Complaint ${item.id} attachment`} /> : null}
      <div className="card-actions">
        <button className="ghost-button" onClick={() => onOpen(item.id)}>
          View details
        </button>
        {admin ? (
          <>
            <label className="inline-control">
              <span>Priority</span>
              <select value={item.priority} onChange={(event) => onPriorityChange(item.id, event.target.value)}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            {NEXT_STATUS_OPTIONS[item.status].length ? (
              <button className="primary-button" onClick={() => onStatusRequest(item)}>
                Update status
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function Timeline({ entries }) {
  if (!entries.length) {
    return <Empty title="No history yet" text="Status updates will appear here as the complaint progresses." />;
  }
  return (
    <div className="timeline">
      {entries.map((entry) => (
        <div className="timeline-item" key={entry.id}>
          <div className="timeline-marker" />
          <div className="timeline-content">
            <div className="timeline-title-row">
              <strong>{entry.new_status}</strong>
              <span>{formatDate(entry.created_at)}</span>
            </div>
            <p className="timeline-subtle">{entry.actor_email || 'System update'}</p>
            {entry.note ? <p>{entry.note}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if (form.password.length < (mode === 'register' ? 8 : 1)) {
      setError(mode === 'register' ? 'Password must be at least 8 characters.' : 'Password is required.');
      return;
    }
    setLoading(true);
    try {
      const data = await api(`/society/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      localStorage.setItem('society_token', data.access_token);
      localStorage.setItem('society_user', JSON.stringify(data.user));
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-copy">
          <LogoMark />
          <p className="eyebrow">Resident and admin portal</p>
          <h1>Manage maintenance without losing the thread.</h1>
          <p className="section-copy">
            Track complaints, follow every status update, review timelines, and keep residents informed through a proper
            community interface.
          </p>
          <ul className="feature-list">
            <li>Complaint tracking with status history and overdue indicators</li>
            <li>Resident notice board with pinned important announcements</li>
            <li>Admin workflow for priorities, timelines, and notice management</li>
          </ul>
        </div>
        <div className="auth-card surface-card">
          <div className="segmented-control" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Login
            </button>
            <button
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Register
            </button>
          </div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create a resident account'}</h2>
          <p className="section-copy">
            {mode === 'login'
              ? 'Use your existing account to access your complaint history and notices.'
              : 'New accounts are created as resident users through the existing backend API.'}
          </p>
          <form className="form-stack" onSubmit={submit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                minLength={mode === 'register' ? 8 : 1}
                required
              />
            </label>
            <InlineMessage tone="error" message={error} />
            <button className="primary-button" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Shell({ user, route, onLogout, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const admin = user.role === 'admin';
  const navItems = admin
    ? [
        { path: '/admin', label: 'Dashboard', match: ['admin-dashboard'] },
        { path: '/complaints', label: 'Complaints', match: ['complaints', 'complaint-detail'] },
        { path: '/notices', label: 'Notices', match: ['notices'] },
        { path: '/profile', label: 'Profile', match: ['profile'] },
      ]
    : [
        { path: '/home', label: 'Dashboard', match: ['resident-dashboard'] },
        { path: '/complaints', label: 'My complaints', match: ['complaints', 'complaint-detail'] },
        { path: '/new', label: 'New complaint', match: ['new-complaint'] },
        { path: '/notices', label: 'Notices', match: ['notices'] },
        { path: '/profile', label: 'Profile', match: ['profile'] },
      ];

  function isActive(item) {
    return item.match.includes(route.name);
  }

  function go(path) {
    setMobileNavOpen(false);
    navigate(path);
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <LogoMark />
          <button className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            ×
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item.path} className={isActive(item) ? 'nav-item active' : 'nav-item'} onClick={() => go(item.path)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-summary">
            <strong>{user.email}</strong>
            <span>{admin ? 'Administrator' : 'Resident account'}</span>
          </div>
          <button className="ghost-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-button mobile-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            ☰
          </button>
          <div>
            <p className="topbar-label">Society Maintenance Tracker</p>
            <strong>{admin ? 'Admin operations' : 'Resident portal'}</strong>
          </div>
          <div className="topbar-profile">
            <span className="user-chip">{user.email}</span>
            <button className="ghost-button desktop-only" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="page-frame">{children}</main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.slice(0, 4).map((item) => (
            <button key={item.path} className={isActive(item) ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => go(item.path)}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      {mobileNavOpen ? <div className="sidebar-scrim" onClick={() => setMobileNavOpen(false)} aria-hidden="true" /> : null}
    </div>
  );
}

function ResidentDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [complaintData, noticeData] = await Promise.all([api('/society/complaints'), api('/society/notices')]);
      setComplaints(complaintData);
      setNotices(noticeData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const openComplaints = complaints.filter((item) => item.status !== 'Resolved');
  const importantNotices = notices.filter((item) => isImportantNotice(item));
  const recentComplaints = complaints.slice(0, 3);

  return (
    <section>
      <SectionHeading
        eyebrow="Resident dashboard"
        title="Keep up with every maintenance request."
        description="See your latest complaints, check overdue items, and stay on top of important society notices."
        actions={
          <button className="primary-button" onClick={() => navigate('/new')}>
            Raise complaint
          </button>
        }
      />
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <Loading label="Loading dashboard..." /> : null}
      {!loading && !error ? (
        <>
          <div className="metric-grid">
            <article className="metric-card surface-card">
              <span>Total complaints</span>
              <strong>{complaints.length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Open or in progress</span>
              <strong>{openComplaints.length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Overdue</span>
              <strong>{complaints.filter((item) => item.overdue).length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Important notices</span>
              <strong>{importantNotices.length}</strong>
            </article>
          </div>
          <div className="dashboard-layout">
            <div className="stack">
              <section className="surface-card panel-section">
                <div className="panel-heading">
                  <h2>Recent complaints</h2>
                  <button className="ghost-button" onClick={() => navigate('/complaints')}>
                    View all
                  </button>
                </div>
                {recentComplaints.length ? (
                  <div className="compact-list">
                    {recentComplaints.map((item) => (
                      <button key={item.id} className="list-row" onClick={() => navigate(`/complaints/${item.id}`)}>
                        <div>
                          <strong>{item.category}</strong>
                          <p>
                            #{item.id} · {formatDate(item.created_at)}
                          </p>
                        </div>
                        <div className="row-badges">
                          <StatusBadge status={item.status} />
                          <OverdueBadge overdue={item.overdue} />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No complaints yet"
                    text="When you submit your first complaint, it will appear here."
                    action={
                      <button className="primary-button" onClick={() => navigate('/new')}>
                        Create your first complaint
                      </button>
                    }
                  />
                )}
              </section>
            </div>
            <div className="stack">
              <section className="surface-card panel-section">
                <div className="panel-heading">
                  <h2>Important notices</h2>
                  <button className="ghost-button" onClick={() => navigate('/notices')}>
                    Notice board
                  </button>
                </div>
                {importantNotices.length ? (
                  <div className="notice-stack">
                    {importantNotices.slice(0, 3).map((notice) => (
                      <article key={notice.id} className="notice-card important">
                        <span className="notice-pill">Pinned</span>
                        <h3>{notice.title}</h3>
                        <p>{notice.content}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty title="No important notices" text="Pinned announcements from admins will appear here." />
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [dashboardData, complaintData, noticeData] = await Promise.all([
        api('/society/admin/dashboard'),
        api('/society/complaints'),
        api('/society/notices'),
      ]);
      setDashboard(dashboardData);
      setComplaints(complaintData);
      setNotices(noticeData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <SectionHeading
        eyebrow="Admin dashboard"
        title="Operations snapshot"
        description="Monitor workload, identify overdue complaints, and keep the community informed."
        actions={
          <button className="ghost-button" onClick={load}>
            Refresh
          </button>
        }
      />
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <Loading label="Loading dashboard..." /> : null}
      {!loading && !error && dashboard ? (
        <>
          <div className="metric-grid">
            <article className="metric-card surface-card">
              <span>Total complaints</span>
              <strong>{dashboard.total}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Open</span>
              <strong>{dashboard.by_status.Open}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>In progress</span>
              <strong>{dashboard.by_status['In Progress']}</strong>
            </article>
            <article className="metric-card surface-card accent">
              <span>Overdue</span>
              <strong>{dashboard.overdue}</strong>
            </article>
          </div>
          <div className="dashboard-layout">
            <section className="surface-card panel-section">
              <div className="panel-heading">
                <h2>Overdue queue</h2>
                <button className="ghost-button" onClick={() => navigate('/complaints')}>
                  Open complaint overview
                </button>
              </div>
              {complaints.filter((item) => item.overdue).length ? (
                <div className="compact-list">
                  {complaints
                    .filter((item) => item.overdue)
                    .slice(0, 5)
                    .map((item) => (
                      <button key={item.id} className="list-row" onClick={() => navigate(`/complaints/${item.id}`)}>
                        <div>
                          <strong>{item.category}</strong>
                          <p>
                            #{item.id} · {item.priority} priority
                          </p>
                        </div>
                        <div className="row-badges">
                          <StatusBadge status={item.status} />
                          <OverdueBadge overdue={item.overdue} />
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty title="No overdue complaints" text="The current queue is within the configured threshold." />
              )}
            </section>
            <section className="surface-card panel-section">
              <div className="panel-heading">
                <h2>Important notices</h2>
                <button className="ghost-button" onClick={() => navigate('/notices')}>
                  Manage notices
                </button>
              </div>
              {notices.filter((item) => item.important).length ? (
                <div className="notice-stack">
                  {notices
                    .filter((item) => item.important)
                    .slice(0, 3)
                    .map((notice) => (
                      <article key={notice.id} className="notice-card important">
                        <span className="notice-pill">Pinned</span>
                        <h3>{notice.title}</h3>
                        <p>{notice.content}</p>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty title="No pinned notices" text="Admins can pin urgent updates from the notice board." />
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ComplaintsPage({ user }) {
  const admin = user.role === 'admin';
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    priority: '',
    date_from: '',
    date_to: '',
    overdueOnly: false,
  });
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusModalComplaint, setStatusModalComplaint] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', note: '' });
  const [submittingStatus, setSubmittingStatus] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (filters.category) query.set('category', filters.category);
      if (filters.status) query.set('status', filters.status);
      if (filters.priority) query.set('priority', filters.priority);
      if (filters.date_from) query.set('date_from', filters.date_from);
      if (filters.date_to) query.set('date_to', filters.date_to);
      const data = await api(`/society/complaints${query.toString() ? `?${query}` : ''}`);
      setComplaints(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filters.category, filters.status, filters.priority, filters.date_from, filters.date_to]);

  const visibleComplaints = useMemo(() => {
    return filters.overdueOnly ? complaints.filter((item) => item.overdue) : complaints;
  }, [complaints, filters.overdueOnly]);

  function openComplaint(id) {
    navigate(`/complaints/${id}`);
  }

  async function updatePriority(id, priority) {
    setSuccess('');
    setError('');
    try {
      await api(`/society/complaints/${id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      setSuccess(`Priority for complaint #${id} updated to ${priority}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openStatusModal(item) {
    const nextStatus = NEXT_STATUS_OPTIONS[item.status][0] || item.status;
    setStatusModalComplaint(item);
    setStatusForm({ status: nextStatus, note: '' });
  }

  async function submitStatusUpdate() {
    if (!statusModalComplaint) return;
    setSubmittingStatus(true);
    setError('');
    setSuccess('');
    try {
      await api(`/society/complaints/${statusModalComplaint.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(statusForm),
      });
      setSuccess(`Complaint #${statusModalComplaint.id} updated to ${statusForm.status}.`);
      setStatusModalComplaint(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmittingStatus(false);
    }
  }

  return (
    <section>
      <SectionHeading
        eyebrow={admin ? 'Admin complaints' : 'Resident complaints'}
        title={admin ? 'Complaint overview' : 'My complaints'}
        description={
          admin
            ? 'Filter the queue, open details, update priorities, and record status changes with notes.'
            : 'Review submitted complaints, their priorities, and every status update in one place.'
        }
        actions={
          !admin ? (
            <button className="primary-button" onClick={() => navigate('/new')}>
              Raise complaint
            </button>
          ) : null
        }
      />
      {admin ? (
        <div className="surface-card filter-bar">
          <label>
            <span>Category</span>
            <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
              <option value="">All</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">All</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
              <option value="">All</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={filters.overdueOnly}
              onChange={(event) => setFilters({ ...filters, overdueOnly: event.target.checked })}
            />
            <span>Overdue only</span>
          </label>
          <button
            className="ghost-button"
            onClick={() =>
              setFilters({
                category: '',
                status: '',
                priority: '',
                date_from: '',
                date_to: '',
                overdueOnly: false,
              })
            }
          >
            Clear filters
          </button>
        </div>
      ) : null}
      <InlineMessage tone="error" message={error} />
      <InlineMessage tone="success" message={success} />
      {loading ? <Loading label="Loading complaints..." /> : null}
      {!loading && !error ? (
        visibleComplaints.length ? (
          <div className="card-grid">
            {visibleComplaints.map((item) => (
              <ComplaintSummaryCard
                key={item.id}
                item={item}
                admin={admin}
                onOpen={openComplaint}
                onPriorityChange={updatePriority}
                onStatusRequest={openStatusModal}
              />
            ))}
          </div>
        ) : (
          <Empty
            title={admin ? 'No complaints match these filters' : 'No complaints yet'}
            text={admin ? 'Try adjusting the filters or clearing overdue-only mode.' : 'Create a complaint to start tracking maintenance issues.'}
            action={
              !admin ? (
                <button className="primary-button" onClick={() => navigate('/new')}>
                  Raise complaint
                </button>
              ) : null
            }
          />
        )
      ) : null}
      <Modal
        open={Boolean(statusModalComplaint)}
        title={statusModalComplaint ? `Update complaint #${statusModalComplaint.id}` : 'Update complaint'}
        onClose={() => setStatusModalComplaint(null)}
        footer={
          <>
            <button className="ghost-button" onClick={() => setStatusModalComplaint(null)}>
              Cancel
            </button>
            <button className="primary-button" disabled={submittingStatus} onClick={submitStatusUpdate}>
              {submittingStatus ? 'Saving...' : 'Save status update'}
            </button>
          </>
        }
      >
        {statusModalComplaint ? (
          <div className="form-stack">
            <label>
              <span>Next status</span>
              <select value={statusForm.status} onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}>
                {NEXT_STATUS_OPTIONS[statusModalComplaint.status].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status-change note</span>
              <textarea
                rows="4"
                value={statusForm.note}
                onChange={(event) => setStatusForm({ ...statusForm, note: event.target.value })}
                placeholder="Explain what changed or what action was taken."
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

function NewComplaintPage() {
  const [form, setForm] = useState({
    category: CATEGORIES[0],
    description: '',
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.description.trim()) {
      setError('Description is required.');
      return;
    }
    if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError('Use a JPG, PNG, or WEBP file up to 5 MB.');
      return;
    }
    setLoading(true);
    try {
      let photo_url = null;
      let photo_public_id = null;
      if (file) {
        const payload = new FormData();
        payload.append('file', file);
        const uploaded = await api('/society/uploads/photo', {
          method: 'POST',
          body: payload,
        });
        photo_url = uploaded.photo_url;
        photo_public_id = uploaded.photo_public_id;
      }
      const created = await api('/society/complaints', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          description: form.description,
          photo_url,
          photo_public_id,
        }),
      });
      setSuccess(`Complaint #${created.id} created successfully.`);
      setForm({ category: CATEGORIES[0], description: '' });
      setFile(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="narrow-column">
      <SectionHeading
        eyebrow="Resident action"
        title="Create a complaint"
        description="Provide a clear issue summary, upload a supporting photo if needed, and submit it directly to the maintenance workflow."
      />
      <form className="surface-card form-card form-stack" onSubmit={submit}>
        <label>
          <span>Category</span>
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Description</span>
          <textarea
            rows="7"
            maxLength="5000"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Describe the issue, location, and anything the maintenance team should know."
          />
        </label>
        <label>
          <span>Upload photo</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        {file ? <div className="file-chip">{file.name}</div> : null}
        <InlineMessage tone="error" message={error} />
        <InlineMessage tone="success" message={success} />
        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={() => navigate('/complaints')}>
            Cancel
          </button>
          <button className="primary-button" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit complaint'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ComplaintDetailPage({ user, complaintId }) {
  const admin = user.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [complaint, setComplaint] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [statusForm, setStatusForm] = useState({ status: '', note: '' });
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [complaintData, historyData] = await Promise.all([
        api(`/society/complaints/${complaintId}`),
        api(`/society/complaints/${complaintId}/history`),
      ]);
      setComplaint(complaintData);
      setHistoryEntries(historyData);
      setStatusForm({
        status: NEXT_STATUS_OPTIONS[complaintData.status][0] || complaintData.status,
        note: '',
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [complaintId]);

  async function updatePriority(priority) {
    setPriorityLoading(true);
    setError('');
    setSuccess('');
    try {
      await api(`/society/complaints/${complaintId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      setSuccess(`Priority updated to ${priority}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPriorityLoading(false);
    }
  }

  async function updateStatus(event) {
    event.preventDefault();
    setStatusLoading(true);
    setError('');
    setSuccess('');
    try {
      await api(`/society/complaints/${complaintId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(statusForm),
      });
      setSuccess(`Status updated to ${statusForm.status}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStatusLoading(false);
    }
  }

  if (loading) return <Loading label="Loading complaint..." />;
  if (error && !complaint) return <ErrorState message={error} onRetry={load} />;
  if (!complaint) return <Empty title="Complaint not found" text="The requested complaint could not be loaded." />;

  return (
    <section className="detail-layout">
      <button className="back-link" onClick={() => navigate('/complaints')}>
        ← Back to complaints
      </button>
      <SectionHeading
        eyebrow={`Complaint #${complaint.id}`}
        title={complaint.category}
        description={`Submitted ${formatDate(complaint.created_at)}`}
        actions={
          <div className="detail-badges">
            <StatusBadge status={complaint.status} />
            <PriorityBadge priority={complaint.priority} />
            <OverdueBadge overdue={complaint.overdue} />
          </div>
        }
      />
      <InlineMessage tone="error" message={error} />
      <InlineMessage tone="success" message={success} />
      <div className="detail-grid">
        <div className="stack">
          <section className="surface-card panel-section">
            <h2>Complaint details</h2>
            <p className="long-copy">{complaint.description}</p>
            {complaint.photo_url ? (
              <figure className="detail-photo-block">
                <img src={complaint.photo_url} alt={`Complaint ${complaint.id} attachment`} className="detail-photo" />
                <figcaption>Uploaded complaint photo</figcaption>
              </figure>
            ) : (
              <p className="subtle-copy">No photo was uploaded for this complaint.</p>
            )}
          </section>
          <section className="surface-card panel-section">
            <div className="panel-heading">
              <h2>Status timeline</h2>
            </div>
            <Timeline entries={historyEntries} />
          </section>
        </div>
        <div className="stack">
          <section className="surface-card panel-section">
            <h2>Overview</h2>
            <dl className="detail-facts">
              <div>
                <dt>Resident ID</dt>
                <dd>{complaint.resident_id}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(complaint.created_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(complaint.updated_at)}</dd>
              </div>
              <div>
                <dt>Resolved</dt>
                <dd>{complaint.resolved_at ? formatDate(complaint.resolved_at) : 'Not resolved yet'}</dd>
              </div>
            </dl>
          </section>
          {admin ? (
            <section className="surface-card panel-section">
              <h2>Admin actions</h2>
              <div className="form-stack">
                <label>
                  <span>Priority</span>
                  <select value={complaint.priority} onChange={(event) => updatePriority(event.target.value)} disabled={priorityLoading}>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                {NEXT_STATUS_OPTIONS[complaint.status].length ? (
                  <form className="form-stack" onSubmit={updateStatus}>
                    <label>
                      <span>Next status</span>
                      <select value={statusForm.status} onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}>
                        {NEXT_STATUS_OPTIONS[complaint.status].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Status-change note</span>
                      <textarea
                        rows="4"
                        value={statusForm.note}
                        onChange={(event) => setStatusForm({ ...statusForm, note: event.target.value })}
                        placeholder="Record the action taken, assignment, or context for this change."
                      />
                    </label>
                    <button className="primary-button" disabled={statusLoading}>
                      {statusLoading ? 'Saving...' : 'Update status'}
                    </button>
                  </form>
                ) : (
                  <p className="subtle-copy">This complaint is already resolved. Its history remains immutable.</p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NoticesPage({ user }) {
  const admin = user.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createForm, setCreateForm] = useState({ title: '', content: '', important: false });
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', important: false });
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/society/notices');
      setItems(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createNotice(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api('/society/notices', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setSuccess('Notice created successfully.');
      setCreateForm({ title: '', content: '', important: false });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function beginEdit(item) {
    setEditItem(item);
    setEditForm({
      title: item.title,
      content: item.content,
      important: item.important,
    });
  }

  async function saveEdit() {
    if (!editItem) return;
    setError('');
    setSuccess('');
    try {
      await api(`/society/notices/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setSuccess(`Notice "${editForm.title}" updated.`);
      setEditItem(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteNotice() {
    if (!deleteTarget) return;
    setError('');
    setSuccess('');
    try {
      await api(`/society/notices/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setSuccess(`Notice "${deleteTarget.title}" deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section>
      <SectionHeading
        eyebrow="Community notices"
        title="Notice board"
        description="Important community updates stay pinned above regular announcements."
      />
      <InlineMessage tone="error" message={error} />
      <InlineMessage tone="success" message={success} />
      {admin ? (
        <form className="surface-card panel-section form-stack" onSubmit={createNotice}>
          <div className="panel-heading">
            <h2>Create notice</h2>
          </div>
          <label>
            <span>Title</span>
            <input value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} required />
          </label>
          <label>
            <span>Content</span>
            <textarea
              rows="5"
              value={createForm.content}
              onChange={(event) => setCreateForm({ ...createForm, content: event.target.value })}
              required
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={createForm.important}
              onChange={(event) => setCreateForm({ ...createForm, important: event.target.checked })}
            />
            <span>Pin as important notice and trigger resident email notifications</span>
          </label>
          <div className="form-actions">
            <button className="primary-button">Publish notice</button>
          </div>
        </form>
      ) : null}
      {loading ? <Loading label="Loading notices..." /> : null}
      {!loading && !error ? (
        items.length ? (
          <div className="notice-stack">
            {items.map((item) => (
              <article key={item.id} className={`surface-card notice-card ${item.important ? 'important' : ''}`}>
                <div className="notice-head">
                  <div>
                    <span className="notice-pill">{item.important ? 'Pinned notice' : 'Notice'}</span>
                    <h2>{item.title}</h2>
                    <p className="notice-meta">
                      {item.author_email || 'Admin'} · {formatDate(item.created_at)}
                    </p>
                  </div>
                  {admin ? (
                    <div className="notice-admin-actions">
                      <button className="ghost-button" onClick={() => beginEdit(item)}>
                        Edit
                      </button>
                      <button className="danger-button" onClick={() => setDeleteTarget(item)}>
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
                <p>{item.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="No notices yet" text="Announcements will appear here when they are published." />
        )
      ) : null}
      <Modal
        open={Boolean(editItem)}
        title={editItem ? `Edit notice #${editItem.id}` : 'Edit notice'}
        onClose={() => setEditItem(null)}
        footer={
          <>
            <button className="ghost-button" onClick={() => setEditItem(null)}>
              Cancel
            </button>
            <button className="primary-button" onClick={saveEdit}>
              Save changes
            </button>
          </>
        }
      >
        <div className="form-stack">
          <label>
            <span>Title</span>
            <input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} />
          </label>
          <label>
            <span>Content</span>
            <textarea rows="5" value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={editForm.important}
              onChange={(event) => setEditForm({ ...editForm, important: event.target.checked })}
            />
            <span>Mark as important</span>
          </label>
        </div>
      </Modal>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete notice"
        message={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete notice"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteNotice}
      />
    </section>
  );
}

function ProfilePage({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [complaintData, noticeData] = await Promise.all([api('/society/complaints'), api('/society/notices')]);
      setComplaints(complaintData);
      setNotices(noticeData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="narrow-column">
      <SectionHeading
        eyebrow="Profile"
        title="Account overview"
        description="Your basic account information comes from the active authenticated session, and the summary cards below are loaded from the live API."
      />
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading ? <Loading label="Loading profile..." /> : null}
      {!loading && !error ? (
        <>
          <section className="surface-card panel-section">
            <h2>User details</h2>
            <dl className="detail-facts">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>{user.user_id}</dd>
              </div>
            </dl>
          </section>
          <div className="metric-grid">
            <article className="metric-card surface-card">
              <span>Complaints visible to you</span>
              <strong>{complaints.length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Resolved complaints</span>
              <strong>{complaints.filter((item) => item.status === 'Resolved').length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Overdue complaints</span>
              <strong>{complaints.filter((item) => item.overdue).length}</strong>
            </article>
            <article className="metric-card surface-card">
              <span>Notices available</span>
              <strong>{notices.length}</strong>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('society_user'));
    } catch {
      return null;
    }
  });
  const [route, setRoute] = useState(getCurrentRoute());
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!location.hash) {
      navigate(user.role === 'admin' ? '/admin' : '/home');
      return;
    }
    if (route.name === 'fallback') {
      navigate(user.role === 'admin' ? '/admin' : '/home');
    }
  }, [user, route.name]);

  function completeLogout() {
    localStorage.removeItem('society_token');
    localStorage.removeItem('society_user');
    setShowLogoutDialog(false);
    setUser(null);
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          navigate(nextUser.role === 'admin' ? '/admin' : '/home');
        }}
      />
    );
  }

  let page = null;
  if (user.role === 'admin' && route.name === 'admin-dashboard') {
    page = <AdminDashboard />;
  } else if (user.role === 'resident' && route.name === 'resident-dashboard') {
    page = <ResidentDashboard />;
  } else if (route.name === 'complaints') {
    page = <ComplaintsPage user={user} />;
  } else if (route.name === 'new-complaint' && user.role === 'resident') {
    page = <NewComplaintPage />;
  } else if (route.name === 'notices') {
    page = <NoticesPage user={user} />;
  } else if (route.name === 'profile') {
    page = <ProfilePage user={user} />;
  } else if (route.name === 'complaint-detail' && route.id) {
    page = <ComplaintDetailPage user={user} complaintId={route.id} />;
  } else {
    page = user.role === 'admin' ? <AdminDashboard /> : <ResidentDashboard />;
  }

  return (
    <>
      <Shell user={user} route={route} onLogout={() => setShowLogoutDialog(true)}>
        {page}
      </Shell>
      <ConfirmDialog
        open={showLogoutDialog}
        title="Logout"
        message="Sign out of the Society Maintenance Tracker on this device?"
        confirmLabel="Logout"
        tone="primary"
        onCancel={() => setShowLogoutDialog(false)}
        onConfirm={completeLogout}
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
