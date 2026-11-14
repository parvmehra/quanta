import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Search, Bell, Menu, PanelLeftClose, PanelLeftOpen, LogOut, UserRound,
  LayoutList, LayoutDashboard, Globe2, CandlestickChart, Briefcase, HelpCircle, Info, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { API_BASE_URL } from '../config';
import { getMarketStatus } from '../utils/marketHours';
import { ChangeValue, Skeleton } from '../components/ui/ui';
import QuantaMark from '../components/QuantaMark';
import './AppShell.css';

const NAV = [
  { group: 'Overview', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, auth: true },
  ]},
  { group: 'Markets', items: [
    { to: '/markets', label: 'Market Overview', icon: Globe2 },
    { to: '/analyzer', label: 'Stock Explorer', icon: LayoutList },
  ]},
  { group: 'Trading', items: [
    { to: '/trade', label: 'Trading Terminal', icon: CandlestickChart, auth: true },
  ]},
  { group: 'My Investments', items: [
    { to: '/portfolio', label: 'Portfolio', icon: Briefcase, auth: true },
  ]},
  { group: 'Account', items: [
    { to: '/profile', label: 'Profile & Wallet', icon: UserRound, auth: true },
  ]},
  { group: 'Help', items: [
    { to: '/faq', label: 'FAQ', icon: HelpCircle },
    { to: '/about', label: 'About', icon: Info },
  ]},
];

const COLLAPSE_KEY = 'quanta-sidebar-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

function IndexStrip() {
  const [state, setState] = useState({ status: 'loading', indices: [] });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/stocks/market-pulse`, { timeout: 12000 });
        const valid = (res.data?.indices || []).filter((i) => Number(i.price) > 0);
        if (!cancelled) setState({ status: valid.length ? 'ok' : 'unavailable', indices: valid });
      } catch {
        if (!cancelled) setState((s) => ({ status: s.indices.length ? 'ok' : 'unavailable', indices: s.indices }));
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="shell-ticker" aria-label="Market indices">
      {state.status === 'loading' && <Skeleton width={260} height={12} />}
      {state.status === 'unavailable' && <span className="shell-ticker__na">Index data currently unavailable</span>}
      {state.status === 'ok' && state.indices.map((i) => (
        <span className="shell-ticker__item" key={i.symbol}>
          <span className="shell-ticker__name">{i.name}</span>
          <span className="shell-ticker__price">{Number(i.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          <ChangeValue value={i.changePercent} />
        </span>
      ))}
      {state.status === 'ok' && <span className="shell-ticker__src">Yahoo Finance · refreshed every 5 min · may be delayed</span>}
    </div>
  );
}

function MarketStatus() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="shell-status" title="Based on regular weekday hours; exchange holidays are not reflected">
      {getMarketStatus(now).map((m) => (
        <span key={m.id} className={`shell-status__item${m.isOpen ? ' is-open' : ''}`}>
          <span className="shell-status__dot" aria-hidden="true" />
          {m.id} {m.isOpen ? 'open' : 'closed'}
        </span>
      ))}
    </div>
  );
}

function useDismiss(ref, onDismiss, active) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onDismiss(); };
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ref, onDismiss, active]);
}

export default function AppShell() {
  const { isAuthenticated, user, logout } = useAuth();
  const { notifications, unreadCount, markAllAsRead, clearNotifications } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const menuRef = useRef(null);

  useDismiss(notifRef, () => setNotifOpen(false), notifOpen);
  useDismiss(menuRef, () => setMenuOpen(false), menuOpen);

  useEffect(() => { setDrawerOpen(false); setNotifOpen(false); setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target?.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { }
      return !c;
    });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) { navigate(`/analyzer?q=${encodeURIComponent(q)}`); setQuery(''); searchRef.current?.blur(); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <aside className="shell-sidebar" aria-label="Primary">
        <div className="shell-sidebar__head">
          <Link to="/" className="shell-brand" aria-label="Quanta home">
            <QuantaMark />
            <span className="shell-brand__name">Quanta</span>
          </Link>
          <button type="button" className="shell-icon-btn shell-sidebar__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="shell-nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.auth || isAuthenticated);
            if (!items.length) return null;
            return (
              <div className="shell-nav__group" key={g.group}>
                <div className="shell-nav__label">{g.group}</div>
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `shell-nav__item${isActive ? ' active' : ''}`} title={collapsed ? label : undefined}>
                    <Icon size={17} aria-hidden="true" />
                    <span className="shell-nav__text">{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <button type="button" className="shell-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span className="shell-nav__text">Collapse</span>
        </button>
      </aside>
      {drawerOpen && <div className="shell-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <div className="shell-main">
        <header className="shell-topbar">
          <button type="button" className="shell-icon-btn shell-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>

          <form className="shell-search" role="search" onSubmit={submitSearch}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol or company"
              aria-label="Search stocks"
            />
            <kbd aria-hidden="true">/</kbd>
          </form>

          <MarketStatus />

          <div className="shell-topbar__right">
            <div className="shell-pop" ref={notifRef}>
              <button
                type="button"
                className="shell-icon-btn"
                onClick={() => { setNotifOpen((o) => !o); if (!notifOpen && unreadCount > 0) markAllAsRead(); }}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                aria-expanded={notifOpen}
              >
                <Bell size={17} />
                {unreadCount > 0 && <span className="shell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notifOpen && (
                <div className="shell-dropdown shell-dropdown--wide" role="dialog" aria-label="Notifications">
                  <div className="shell-dropdown__head">
                    <strong>Notifications</strong>
                    {notifications.length > 0 && <button type="button" className="shell-link-btn" onClick={clearNotifications}>Clear all</button>}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="shell-dropdown__empty">No notifications yet.</p>
                  ) : (
                    <ul className="shell-notifs">
                      {notifications.slice(0, 20).map((n) => (
                        <li key={n.id}>
                          <span className="shell-notifs__title">{n.title}</span>
                          <span className="shell-notifs__msg">{n.message}</span>
                          <time dateTime={n.date}>{new Date(n.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <div className="shell-pop" ref={menuRef}>
                <button type="button" className="shell-avatar" onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu" aria-expanded={menuOpen}>
                  {(user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
                </button>
                {menuOpen && (
                  <div className="shell-dropdown" role="menu">
                    <div className="shell-dropdown__who">
                      <strong>{user?.name}</strong>
                      <span>{user?.email}</span>
                    </div>
                    <Link to="/profile" role="menuitem" className="shell-dropdown__item"><UserRound size={15} /> Profile &amp; Wallet</Link>
                    <button type="button" role="menuitem" className="shell-dropdown__item" onClick={handleLogout}><LogOut size={15} /> Log out</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary btn-sm">Log in</Link>
                <Link to="/signup" className="btn btn-accent btn-sm shell-hide-sm">Sign up</Link>
              </>
            )}
          </div>
        </header>

        <IndexStrip />

        <main className="shell-content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
