import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/workspace.css';
import './About.css';

const SECTIONS = [
  {
    title: 'What Quanta is',
    body: (
      <>
        <p>Quanta is a financial analytics and paper-trading platform. You can explore US and Indian markets, research stocks with charts, fundamentals and news, follow watchlists, manage a simulated portfolio and practise placing orders against live prices.</p>
        <p>It is built to feel like a research workstation: dense tables, honest numbers and clear labels for where data comes from and how fresh it is.</p>
      </>
    ),
  },
  {
    title: 'What it is not',
    body: (
      <ul>
        <li>It does not trade real money. There is no broker connection and no payment gateway.</li>
        <li>It does not give investment advice. Notes written by the AI Advisor are for education and can be wrong.</li>
        <li>It is not an exchange. Simulated orders are filled by Quanta at the latest price it receives, which may be delayed.</li>
      </ul>
    ),
  },
  {
    title: 'How the numbers work',
    body: (
      <>
        <p>Market data comes from Yahoo Finance and can be delayed. When a value is not available, Quanta shows a dash or an unavailable message instead of an estimate, and a dash never means zero.</p>
        <p>Trading rules are simple and written down: a flat 0.03% fee, no leverage, no short selling, and separate dollar and rupee wallets with no currency conversion. Every change to your balance is recorded in an append-only transaction history.</p>
      </>
    ),
  },
  {
    title: 'How it is built',
    body: (
      <p>A React front end and a single Express server with Socket.IO for live prices, storing everything in MongoDB. Charts use Recharts and TradingView&rsquo;s Lightweight Charts. Trading, wallet and portfolio logic runs on the server inside database transactions, so the browser can never set a price or a balance. The code is covered by automated tests for trading rules, security and the advisor.</p>
    ),
  },
  {
    title: 'Privacy and security',
    body: (
      <p>Passwords and one-time codes are stored only as hashes. Sign-in uses a password plus an emailed code, every request is checked against your login, and you can only see your own data. Quanta does not sell or share your information.</p>
    ),
  },
];

export default function About() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="about">
      <div className="pg about-inner">
        <header>
          <h1 className="pg-title">About Quanta</h1>
          <p className="pg-sub">A paper-trading and market research workstation. Practise with live prices, risk nothing.</p>
        </header>

        {SECTIONS.map((s) => (
          <section className="panel about-section" key={s.title}>
            <div className="panel-head"><h2 className="panel-title">{s.title}</h2></div>
            <div className="about-body">{s.body}</div>
          </section>
        ))}

        <div className="about-cta">
          {isAuthenticated
            ? <Link to="/dashboard" className="btn btn-accent">Open your dashboard</Link>
            : <><Link to="/signup" className="btn btn-accent">Create an account</Link><Link to="/login" className="btn btn-secondary">Sign in</Link></>}
          <Link to="/faq" className="btn btn-secondary">Read the FAQ</Link>
          <Link to="/markets" className="btn btn-secondary">View markets</Link>
        </div>
      </div>
    </div>
  );
}
