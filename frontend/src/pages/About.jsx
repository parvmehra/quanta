import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { TrendingUp, Users, Award, Globe, Target, Heart, ArrowRight, ShieldCheck, Zap, BarChart3, CheckCircle2 } from "lucide-react";
import { useNotification } from "../contexts/NotificationContext";
import "./About.css";

const About = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const handleProtectedNavigation = (e, path) => {
    e.preventDefault();
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (!isAuthenticated) {
      addNotification('Authentication Required', 'Please sign in first', 'info');
      navigate('/login');
    } else {
      navigate(path);
    }
  };

  const features = [
    {
      icon: <TrendingUp size={24} />,
      iconClass: "about-feat-green",
      title: "Advanced Analytics",
      description: "Sophisticated algorithms analyze market trends and provide actionable insights for your investment decisions.",
    },
    {
      icon: <Zap size={24} />,
      iconClass: "about-feat-amber",
      title: "Real-Time Intelligence",
      description: "Live tick-by-tick market data and instantaneous quote updates across major international and domestic exchanges.",
    },
    {
      icon: <Award size={24} />,
      iconClass: "about-feat-blue",
      title: "Proven Results",
      description: "Track record of helping retail and institutional investors make informed decisions with high-fidelity analytics.",
    },
    {
      icon: <Globe size={24} />,
      iconClass: "about-feat-purple",
      title: "Global Markets Coverage",
      description: "Full access to NASDAQ, NYSE, NSE, BSE and major international indices all within a unified platform.",
    },
    {
      icon: <Target size={24} />,
      iconClass: "about-feat-cyan",
      title: "Precision Focus",
      description: "Laser-focused technical indicators, candlestick charting, and fundamental ratios that cut through market noise.",
    },
    {
      icon: <ShieldCheck size={24} />,
      iconClass: "about-feat-emerald",
      title: "Enterprise Grade",
      description: "Built with bank-grade security, encrypted sessions, and resilient data failovers for uninterrupted market access.",
    },
  ];

  const teamMembers = [
    { name: "Purusharth Mittal", role: "Frontend & Product Engineer", initials: "PM" },
    { name: "Vibhor Dhiman", role: "Backend & Systems Architect", initials: "VD" },
    { name: "Vansh Vashisth", role: "Financial Data & Analytics", initials: "VV" },
    { name: "Pranav Goyal", role: "Full Stack Engineer", initials: "PG" },
  ];

  const values = [
    {
      title: "Transparency",
      desc: "No black boxes. Clear data sources, transparent calculation methodologies, and honest financial tracking."
    },
    {
      title: "Accuracy",
      desc: "Relentless verification of pricing models, historical candle synchronization, and real-time quotes."
    },
    {
      title: "Innovation",
      desc: "Bridging professional Bloomberg-caliber analytics with intuitive, modern human-centered interface design."
    },
    {
      title: "Accessibility",
      desc: "Democratizing institutional financial intelligence for retail investors, learners, and analysts worldwide."
    }
  ];

  return (
    <div className="about-page">
      <div className="about-container">
        
        <section className="about-hero">
          <span className="about-eyebrow">OUR STORY & VISION</span>
          <h1 className="about-title">
            Built for modern investors.<br />
            Designed for <span className="about-title-accent">intelligent decisions.</span>
          </h1>
          <p className="about-subtitle">
            Quanta bridges institutional-grade market data with a human-designed,
            responsive financial analytics platform for global stock researchers.
          </p>
        </section>

        <section className="about-mission-section">
          <div className="about-mission-card">
            <div className="about-mission-text">
              <span className="about-section-tag">MISSION STATEMENT</span>
              <h2>Democratizing Professional Financial Intelligence</h2>
              <p>
                At Quanta, we believe that every investor deserves access to
                professional-grade investment tools, technical analysis, and clean fundamental metrics.
                Our mission is to eliminate information asymmetry by providing sophisticated,
                uncluttered market intelligence.
              </p>
              <p>
                We combine real-time exchange connectivity with intuitive candlestick charts,
                portfolio balance tracking, and deep company fundamentals so you can invest with conviction.
              </p>
              <div className="about-mission-bullets">
                <div className="about-bullet">
                  <CheckCircle2 size={18} className="bullet-icon" />
                  <span>Real-time feeds across US and Indian exchanges</span>
                </div>
                <div className="about-bullet">
                  <CheckCircle2 size={18} className="bullet-icon" />
                  <span>Instant fundamental ratios & technical indicators</span>
                </div>
              </div>
            </div>

            <div className="about-mission-stats">
              <div className="about-stat-box">
                <span className="about-stat-num">50K+</span>
                <span className="about-stat-lbl">Active Researchers</span>
              </div>
              <div className="about-stat-box">
                <span className="about-stat-num">1M+</span>
                <span className="about-stat-lbl">Analyses Generated</span>
              </div>
              <div className="about-stat-box">
                <span className="about-stat-num">99.9%</span>
                <span className="about-stat-lbl">Data Feed Uptime</span>
              </div>
            </div>
          </div>
        </section>

        <section className="about-features-section">
          <div className="about-section-header">
            <span className="about-section-tag">CAPABILITIES</span>
            <h2>What Sets Quanta Apart</h2>
            <p>Every tool and interface element was purpose-built for speed, clarity, and analytical depth.</p>
          </div>

          <div className="about-features-grid">
            {features.map((feature, index) => (
              <div key={index} className="about-feature-card">
                <div className={`about-feature-icon ${feature.iconClass}`}>
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-values-section">
          <div className="about-section-header">
            <span className="about-section-tag">CORE PRINCIPLES</span>
            <h2>Values That Drive Our Product</h2>
          </div>

          <div className="about-values-grid">
            {values.map((val, idx) => (
              <div key={idx} className="about-value-card">
                <div className="about-value-num">0{idx + 1}</div>
                <h3>{val.title}</h3>
                <p>{val.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-team-section">
          <div className="about-section-header">
            <span className="about-section-tag">ENGINEERING & PRODUCT</span>
            <h2>Meet The Builders</h2>
            <p>The team dedicated to crafting a world-class financial research platform.</p>
          </div>

          <div className="about-team-grid">
            {teamMembers.map((member, index) => (
              <div key={index} className="about-team-card">
                <div className="about-member-avatar">
                  <span>{member.initials}</span>
                </div>
                <h3>{member.name}</h3>
                <h4>{member.role}</h4>
              </div>
            ))}
          </div>
        </section>

        <section className="about-cta-section">
          <div className="about-cta-card">
            <h2>Ready to Elevate Your Market Research?</h2>
            <p>Experience real-time stock screener, candlestick analysis, and portfolio tracking today.</p>
            <div className="about-cta-buttons">
              <button
                className="about-btn-primary"
                onClick={(e) => handleProtectedNavigation(e, '/analyzer')}
              >
                Start Analyzing <ArrowRight size={16} />
              </button>
              <button
                className="about-btn-secondary"
                onClick={(e) => handleProtectedNavigation(e, '/portfolio')}
              >
                View Portfolio
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default About;
