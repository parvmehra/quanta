import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Menu, X, Bell, User, LogOut, Search, HelpCircle, UserCog } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead, clearNotifications } = useNotification();
  const notifRef = useRef(null);
  const { isAuthenticated, logout: authLogout } = useAuth();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifRef]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setShowNotifications(false);
  }, [location]);

  const handleLogout = async () => {
    await authLogout();
    navigate('/');
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications && unreadCount > 0) markAllAsRead();
  };

  const handleNavSearch = (e) => {
    if (e.key === 'Enter' && navSearch.trim()) {
      navigate(`/analyzer?q=${encodeURIComponent(navSearch.trim())}`);
      setNavSearch('');
    }
  };

  // Base navigation links visible to everyone
  const baseLinks = [
    { to: '/', label: 'Home' },
    { to: '/analyzer', label: 'Analyzer' },
    { to: '/about', label: 'About' },
  ];

  // Links visible only after login
  const navLinks = isAuthenticated
    ? [
        { to: '/', label: 'Home' },
        { to: '/analyzer', label: 'Analyzer' },
        { to: '/portfolio', label: 'Portfolio' },
        { to: '/faq', label: 'FAQ' },
        { to: '/about', label: 'About' },
      ]
    : baseLinks;

  return (
    <header className={`header${isScrolled ? ' scrolled' : ''}`} role="banner">
      <div className="header-container">
        {/* Logo */}
        <Link to="/" className="logo" aria-label="MarketLens home">
          <div className="logo-icon">
            <LineChart size={20} strokeWidth={2.5} />
          </div>
          MarketLens
        </Link>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" aria-label="Main navigation">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-link${location.pathname === to ? ' active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Search Bar */}
        <div className="nav-search-wrapper">
          <span className="nav-search-icon">
            <Search size={14} />
          </span>
          <input
            type="text"
            className="nav-search-input"
            placeholder="Search stocks (e.g. AAPL)"
            value={navSearch}
            onChange={e => setNavSearch(e.target.value)}
            onKeyDown={handleNavSearch}
            aria-label="Search stocks"
          />
        </div>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Notification Bell */}
          <div className="notification-wrapper" ref={notifRef}>
            <button
              className="icon-btn"
              onClick={toggleNotifications}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={showNotifications}
            >
              <Bell size={18} />
              <span className="notification-badge" aria-hidden="true" />
            </button>

            {showNotifications && (
              <div className="notification-dropdown" role="dialog" aria-label="Notifications">
                <div className="notification-header">
                  <h4>Notifications</h4>
                  {notifications.length > 0 && (
                    <button className="clear-notif-btn" onClick={clearNotifications}>Clear all</button>
                  )}
                </div>
                <div className="notification-list" role="list">
                  {notifications.length === 0 ? (
                    <div className="notification-empty">No recent activity</div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className={`notification-item ${notif.read ? 'read' : 'unread'}`} role="listitem">
                        <div className={`notification-icon type-${notif.type}`} aria-hidden="true" />
                        <div className="notification-content">
                          <p className="notification-title">{notif.title}</p>
                          <p className="notification-message">{notif.message}</p>
                          <span className="notification-time">
                            {new Date(notif.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Avatar / Auth Actions */}
          {isAuthenticated ? (
            <div className="user-action-group">
              <Link to="/profile" className="icon-btn user-avatar-btn" title="Profile & Settings" aria-label="Profile">
                <User size={18} />
              </Link>
              <button className="icon-btn logout-header-btn" onClick={handleLogout} title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="icon-btn user-avatar-btn" title="Sign In / Profile" aria-label="Sign In">
              <User size={18} />
            </Link>
          )}

          {/* Mobile Toggle */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div className={`mobile-nav${mobileMenuOpen ? ' open' : ''}`} aria-hidden={!mobileMenuOpen}>
        {navLinks.map(({ to, label }) => (
          <Link key={to} to={to} className="mobile-nav-link">{label}</Link>
        ))}
        <div className="mobile-nav-divider" />
        <div className="mobile-auth-actions">
          {isAuthenticated ? (
            <button onClick={handleLogout} className="btn btn-secondary full-width">Log out</button>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary full-width text-center">Log in</Link>
              <Link to="/signup" className="btn btn-accent full-width text-center">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

