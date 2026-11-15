import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/ui';
import '../styles/workspace.css';
import './FAQ.css';

const FAQ = [
  { group: 'Getting started', items: [
    { q: 'What is Quanta?', a: <>A financial research and paper-trading platform. You can explore US and Indian markets, research stocks, follow watchlists, manage a simulated portfolio and practise trading with live prices. No real money is ever involved.</> },
    { q: 'Do I need a broker account or to pay anything?', a: <>No. Quanta does not connect to a broker or an exchange, and there is no payment gateway. All balances, orders and holdings are simulated.</> },
    { q: 'Which markets are supported?', a: <>US-listed stocks and ETFs, and Indian stocks on NSE and BSE (symbols ending in <strong>.NS</strong> or <strong>.BO</strong>). Indices such as the S&amp;P 500 can be viewed but not traded.</> },
    { q: 'How do I sign in?', a: <>With your email and password, followed by a one-time code sent to your email. Google sign-in appears when it is configured on the server.</> },
  ] },
  { group: 'Trading', items: [
    { q: 'Are my trades real?', a: <>No. Orders are simulated. They are filled by Quanta at the latest price it receives from Yahoo Finance, which may be delayed, and nothing is sent to an exchange. The final price can differ from the estimate you saw when reviewing the order.</> },
    { q: 'What order types are available?', a: <><strong>Market</strong> orders fill immediately. <strong>Limit</strong> orders wait until the price reaches your limit or better. <strong>Stop</strong> orders wait until the price reaches your stop; a stop sell works as a stop-loss. Waiting orders are checked about every 20 seconds while the server is running, and they fill at the price seen at that moment, which can be better or worse than your trigger.</> },
    { q: 'What does it cost?', a: <>A flat 0.03% of the order value on both buys and sells. There is no brokerage, no leverage and no short selling: you can only sell shares you own.</> },
    { q: 'What happens when the market is closed?', a: <>Market orders fill at the last available price and the order ticket tells you so. Limit and stop orders keep waiting for their price.</> },
    { q: 'Why was my order rejected?', a: <>Usually because the balance in that currency was too low, you did not own enough shares, or no live price was available for the symbol. Rejected orders are kept in your order history with the reason.</> },
    { q: 'Can I cancel an order?', a: <>Yes, while it is open. Open orders can be cancelled from the terminal or the Orders page. Filled orders cannot be undone.</> },
    { q: 'Can I buy part of a share?', a: <>Yes, up to four decimal places.</> },
  ] },
  { group: 'Portfolio and wallet', items: [
    { q: 'How much money do I start with?', a: <>Every account starts with 500,000 USD and 5,000,000 INR of simulated funds. US-listed stocks use the dollar balance and NSE or BSE stocks use the rupee balance. There is no currency conversion, and the two are never added together.</> },
    { q: 'Can I add more funds?', a: <>Yes, on the Wallet page you can make simulated deposits of up to 1,000,000 per deposit and 5,000,000 per day in each currency. Every change to your balance is recorded in your transaction history and cannot be edited.</> },
    { q: 'How are average cost and profit calculated?', a: <>Average cost is share-weighted and includes buy fees. Unrealised profit is the current value minus cost. Realised profit is recorded when you sell and equals the proceeds after the sell fee minus the average cost of the shares sold. Today&rsquo;s profit uses the price change since the previous close.</> },
    { q: 'Can I import my real holdings?', a: <>Yes. On the Portfolio page, choose Import CSV and pick a format: Zerodha, Groww, Angel One, Upstox or a generic file. Indian broker files are treated as NSE stocks. Importing adds holdings to your portfolio without changing your wallet.</> },
  ] },
  { group: 'Market data', items: [
    { q: 'Where does the data come from?', a: <>Yahoo Finance, through an unofficial public interface. Quotes can be delayed, and sometimes the provider is temporarily unavailable. When data is missing Quanta shows a dash or an unavailable message rather than an estimate.</> },
    { q: 'What does a dash mean?', a: <>A dash (—) means the provider did not report that value. It is not zero.</> },
    { q: 'How often do prices update?', a: <>On the stock page and the terminal, live prices are refreshed about every 15 seconds while the page is open. Lists and tables refresh every 30 to 60 seconds. Chart times are shown in your local time zone.</> },
    { q: 'Why do some stocks have few fundamentals?', a: <>Coverage varies by company and market. Indices, funds and some non-US stocks report only a few fields.</> },
  ] },
  { group: 'AI Advisor', items: [
    { q: 'What does the AI Advisor do?', a: <>It writes short research notes about a stock you choose. The server gathers the live figures itself, shows them in the panel next to the chat and gives the AI only those figures. It never tells you to buy, sell or hold.</> },
    { q: 'Why does an answer say "Rule-based summary"?', a: <>Either no AI model is configured on the server, or the model did not respond. The summary is then computed directly from the same figures, without AI.</> },
    { q: 'Can the AI be wrong?', a: <>Yes. Text written by an AI can contain mistakes. Check figures against the data panel and the stock page, and never treat an answer as advice.</> },
    { q: 'Does it see my portfolio?', a: <>No. It only sees public data for the stock you picked and your last few messages in the chat.</> },
  ] },
  { group: 'Account and security', items: [
    { q: 'Why do I get a code every time I sign in?', a: <>Quanta uses two-step sign-in. After your password is accepted, a one-time code is sent to your email. Codes expire quickly, work once, and stop working after five wrong attempts.</> },
    { q: 'How do I change my password?', a: <>In Settings. Changing it signs out every other session and sends you a confirmation email. If you forgot it, use the reset link on the sign-in page.</> },
    { q: 'How is my data protected?', a: <>Passwords and one-time codes are stored only as hashes, and codes are never kept in the notification log. Every request is checked against your login, and you can only see your own orders, wallet and watchlists. No system is perfectly secure, so use a strong, unique password.</> },
    { q: 'Where are my watchlists saved?', a: <>In your account, so they follow you to any device. You can have up to 10 lists of 100 stocks each.</> },
    { q: 'Can I delete my account?', a: <>Not yet from inside the app. This is on the list of things still to build.</> },
  ] },
];

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
};

export default function FAQPage() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.map((g) => ({ ...g, items: g.items.filter((i) => i.q.toLowerCase().includes(q) || textOf(i.a).toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [query]);

  return (
    <div className="pg faq">
      <header className="pg-head">
        <div>
          <h1 className="pg-title">Help and FAQ</h1>
          <p className="pg-sub">How Quanta works, in plain language. Everything here describes the app as it behaves today.</p>
        </div>
      </header>

      <label className="field faq-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the help" aria-label="Search the help" />
      </label>

      {groups.length === 0 && <section className="panel"><EmptyState title="No matches">Try different words, or read the <Link to="/about" className="shell-link-btn">About page</Link>.</EmptyState></section>}

      {groups.map((g) => (
        <section className="panel" key={g.group} aria-label={g.group}>
          <div className="panel-head"><h2 className="panel-title">{g.group}</h2></div>
          <div className="faq-list">
            {g.items.map((i) => (
              <details key={i.q} open={Boolean(query.trim())}>
                <summary>{i.q}</summary>
                <div className="faq-answer">{i.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
