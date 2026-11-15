import React from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Footer.css';

const Footer = () => {
  const { isAuthenticated } = useAuth();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <div className="footer-logo">
              <Activity className="footer-logo-icon" />
              <span>Quanta</span>
            </div>
            <p className="footer-description">Market research and paper trading for US and Indian stocks.</p>
          </div>

          <div className="footer-section">
            <h2>Markets</h2>
            <ul className="footer-links">
              <li><Link to="/markets">Market overview</Link></li>
              <li><Link to="/analyzer">Stock explorer</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h2>Account</h2>
            <ul className="footer-links">
              {isAuthenticated ? (
                <>
                  <li><Link to="/dashboard">Dashboard</Link></li>
                  <li><Link to="/portfolio">Portfolio</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/login">Sign in</Link></li>
                  <li><Link to="/signup">Create account</Link></li>
                </>
              )}
            </ul>
          </div>

          <div className="footer-section">
            <h2>Help</h2>
            <ul className="footer-links">
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/about">About</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Quanta. Simulated trading only. Data from Yahoo Finance may be delayed. Not investment advice.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
