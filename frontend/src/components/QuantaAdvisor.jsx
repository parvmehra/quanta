import React, { useState, useEffect, useRef } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { 
  Sparkles, Send, RotateCcw, Trash2, X, ExternalLink, 
  TrendingUp, TrendingDown, Layers, ShieldAlert, Cpu, 
  ArrowUpRight, ArrowDownRight, RefreshCw, Star, Check
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { getCurrencyCode } from '../utils/currency';
import './QuantaAdvisor.css';

const FormattedAdvisorText = ({ content }) => {
  const cleanedText = (content || '').replace(/<!--ACTIONS:[\s\S]*?-->/g, '').trim();

  const lines = cleanedText.split('\n');
  const elements = [];
  let currentList = [];
  let currentTable = [];

  const flushList = (key) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${key}`}>
          {currentList.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const flushTable = (key) => {
    if (currentTable.length > 0) {
      const rows = currentTable.map(r => r.split('|').map(c => c.trim()).filter(Boolean));
      if (rows.length >= 2) {
        const header = rows[0];
        const bodyRows = rows.slice(1).filter(r => !r.every(c => c.startsWith('---') || c.startsWith(':--')));
        
        elements.push(
          <div key={`table-wrap-${key}`} style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {header.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      currentTable = [];
    }
  };

  const formatInline = (text) => {
    if (!text) return '';
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/\[Switch to ([A-Z0-9.-]+)\]\([^)]*\)/g, '<span class="mla-inline-ticker">$1</span>');
    return formatted;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList(index);
      currentTable.push(trimmed);
      return;
    } else {
      flushTable(index);
    }

    if (trimmed.startsWith('### ')) {
      flushList(index);
      elements.push(<h3 key={index}>{trimmed.replace('### ', '')}</h3>);
    } else if (trimmed.startsWith('#### ')) {
      flushList(index);
      elements.push(<h4 key={index}>{trimmed.replace('#### ', '')}</h4>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
    } else if (trimmed.length > 0) {
      flushList(index);
      elements.push(
        <p key={index} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
      );
    }
  });

  flushList('final');
  flushTable('final');

  return <div className="mla-markdown">{elements}</div>;
};

const QuantaAdvisor = ({
  symbol = 'AAPL',
  stockData = null,
  indicators = {},
  onSwitchStock,
  onOpenBuyOrder,
  onOpenSellOrder,
  onAddToWatchlist,
  onViewAnalysis,
  onClose,
}) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [activeStock, setActiveStock] = useState(symbol);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const priceCurrencyCode = getCurrencyCode(symbol, stockData?.exchange);
  const priceCurrencySymbol = priceCurrencyCode === 'INR' ? '₹' : '$';

  const getDefaultChips = (sym) => [
    `Analyze ${sym}`,
    `Should I buy, sell, or hold?`,
    `What are its main risks?`,
    `Find similar stocks`,
    `Compare it with competitors`,
    `Explain its recent price movement`,
  ];

  useEffect(() => {
    if (!symbol) return;

    const defaultChips = getDefaultChips(symbol);
    setSuggestedQuestions(defaultChips);

    if (messages.length === 0) {
      setActiveStock(symbol);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `👋 **Welcome to Quanta AI!**\n\nI am your dedicated stock research copilot for **${stockData?.name || symbol}** (${symbol.toUpperCase()}).\n\nI track live prices, RSI (${indicators.rsi || '50.0'}), moving averages, and order flows in real-time. Ask me anything or select a research question below!`,
          symbol: symbol.toUpperCase(),
          timestamp: Date.now(),
          actions: [
            { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: symbol.toUpperCase() },
            { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: symbol.toUpperCase() },
            { type: 'VIEW_ANALYSIS', label: 'View Stock Analysis', symbol: symbol.toUpperCase() },
          ],
        },
      ]);
    } else if (activeStock !== symbol) {
      setActiveStock(symbol);
      setMessages(prev => [
        ...prev,
        {
          id: `context-switch-${Date.now()}`,
          isContextDivider: true,
          symbol: symbol.toUpperCase(),
          exchange: stockData?.exchange || (priceCurrencyCode === 'INR' ? 'NSE' : 'NASDAQ'),
        },
        {
          id: `switched-${Date.now()}`,
          role: 'assistant',
          content: `Switched context to **${stockData?.name || symbol}** (${symbol.toUpperCase()}). Ready to analyze its fundamentals, technical signals, and trade setup.`,
          symbol: symbol.toUpperCase(),
          timestamp: Date.now(),
          actions: [
            { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: symbol.toUpperCase() },
            { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: symbol.toUpperCase() },
          ],
        }
      ]);
    }
  }, [symbol, stockData?.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    setInputValue('');

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      symbol: symbol.toUpperCase(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const historyPayload = messages
        .filter(m => !m.isContextDivider && m.content)
        .slice(-6)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          content: m.content,
        }));

      const contextPayload = {
        name: stockData?.name || symbol,
        price: stockData?.price || 0,
        change: stockData?.change || 0,
        changePercent: stockData?.changePercent || 0,
        high: stockData?.high || indicators.dayHigh || 0,
        low: stockData?.low || indicators.dayLow || 0,
        open: stockData?.open || 0,
        previousClose: stockData?.previousClose || 0,
        rsi: indicators.rsi || 50,
        sma: indicators.sma || 0,
        vwap: indicators.vwap || 0,
        exchange: stockData?.exchange || (priceCurrencyCode === 'INR' ? 'NSE' : 'NASDAQ'),
      };

      const res = await axiosInstance.post('/api/stocks/advisor', {
        symbol: symbol.toUpperCase(),
        message: text,
        history: historyPayload,
        context: contextPayload,
      });

      const { response, suggestedActions, suggestedQuestions: newQuestions } = res.data;

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        symbol: symbol.toUpperCase(),
        timestamp: Date.now(),
        actions: suggestedActions || [],
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (newQuestions && newQuestions.length > 0) {
        setSuggestedQuestions(newQuestions);
      }
    } catch (err) {
      console.error("AI Advisor request failed:", err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Unable to connect to AI Advisor.** Please verify your network connection or try again shortly. You can continue trading directly using the order panel.`,
          symbol: symbol.toUpperCase(),
          timestamp: Date.now(),
          actions: [
            { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: symbol.toUpperCase() },
            { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: symbol.toUpperCase() },
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewConversation = () => {
    const defaultChips = getDefaultChips(symbol);
    setSuggestedQuestions(defaultChips);
    setMessages([
      {
        id: `fresh-${Date.now()}`,
        role: 'assistant',
        content: `Fresh research session started for **${stockData?.name || symbol}** (${symbol.toUpperCase()}).\n\nWhat would you like to explore? Ask about fundamental valuation, technical entry/exit points, or competitor setups.`,
        symbol: symbol.toUpperCase(),
        timestamp: Date.now(),
        actions: [
          { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: symbol.toUpperCase() },
          { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: symbol.toUpperCase() },
          { type: 'VIEW_ANALYSIS', label: 'View Stock Analysis', symbol: symbol.toUpperCase() },
        ],
      },
    ]);
  };

  const handleClearChat = () => {
    setMessages([]);
    setSuggestedQuestions(getDefaultChips(symbol));
  };

  const handleActionClick = (action) => {
    if (!action) return;

    if (action.type === 'BUY_ORDER') {
      if (onOpenBuyOrder) onOpenBuyOrder();
    } else if (action.type === 'SELL_ORDER') {
      if (onOpenSellOrder) onOpenSellOrder();
    } else if (action.type === 'SWITCH_STOCK') {
      const targetSym = action.symbol || symbol;
      if (onSwitchStock) onSwitchStock(targetSym);
    } else if (action.type === 'VIEW_ANALYSIS') {
      const targetSym = action.symbol || symbol;
      if (onViewAnalysis) onViewAnalysis(targetSym);
    } else if (action.type === 'ADD_WATCHLIST') {
      if (onAddToWatchlist) onAddToWatchlist();
    } else {
      sendMessage(action.label || `Details on ${action.symbol}`);
    }
  };

  return (
    <div className="mla-panel animate-fade-in" role="complementary" aria-label="Quanta AI Advisor">
      
      <div className="mla-header">
        <div className="mla-header-left">
          <div className="mla-bot-avatar">
            <Sparkles size={18} />
          </div>
          <div className="mla-header-titles">
            <div className="mla-title-row">
              <span className="mla-title">Quanta AI</span>
              <span className="mla-badge">Gemini</span>
            </div>
            <span className="mla-subtitle">Your stock research assistant</span>
          </div>
        </div>

        <div className="mla-header-actions">
          <button 
            type="button" 
            className="mla-icon-btn" 
            onClick={handleNewConversation}
            title="Start new conversation"
          >
            <RotateCcw size={14} />
          </button>
          <button 
            type="button" 
            className="mla-icon-btn" 
            onClick={handleClearChat}
            title="Clear chat history"
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button 
              type="button" 
              className="mla-icon-btn" 
              onClick={onClose}
              title="Collapse AI panel"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="mla-context-banner">
        <div className="mla-context-tag">
          <span className="mla-context-dot"></span>
          <span>{symbol.toUpperCase()}</span>
          <span style={{ color: '#A2AAA3' }}>•</span>
          <span style={{ fontSize: '0.68rem', color: '#A2AAA3' }}>
            {stockData?.exchange || (priceCurrencyCode === 'INR' ? 'NSE' : 'NASDAQ')}
          </span>
        </div>
        <div className="mla-context-price">
          {stockData?.price !== undefined 
            ? `${priceCurrencySymbol}${Number(stockData.price).toFixed(2)}` 
            : 'Live Feed'}
        </div>
      </div>

      <div className="mla-messages-container">
        {messages.map((msg) => {
          if (msg.isContextDivider) {
            return (
              <div key={msg.id} className="mla-switch-divider">
                <span>Switched to {msg.symbol} ({msg.exchange})</span>
              </div>
            );
          }

          const isUser = msg.role === 'user';

          return (
            <div key={msg.id} className={`mla-msg-row ${isUser ? 'user' : 'assistant'}`}>
              <div className="mla-msg-bubble">
                {isUser ? (
                  <p style={{ margin: 0 }}>{msg.content}</p>
                ) : (
                  <>
                    <FormattedAdvisorText 
                      content={msg.content} 
                      onSwitchStock={onSwitchStock} 
                    />

                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mla-actions-block">
                        <span className="mla-actions-title">
                          <Cpu size={11} /> Suggested Actions:
                        </span>
                        <div className="mla-actions-grid">
                          {msg.actions.map((act, actIdx) => {
                            let btnClass = 'mla-action-btn';
                            let icon = <ArrowUpRight size={12} />;

                            if (act.type === 'BUY_ORDER') {
                              btnClass += ' buy';
                              icon = <TrendingUp size={12} />;
                            } else if (act.type === 'SELL_ORDER') {
                              btnClass += ' sell';
                              icon = <TrendingDown size={12} />;
                            } else if (act.type === 'SWITCH_STOCK') {
                              btnClass += ' switch';
                              icon = <RefreshCw size={12} />;
                            } else if (act.type === 'ADD_WATCHLIST') {
                              icon = <Star size={12} />;
                            }

                            return (
                              <button
                                key={actIdx}
                                type="button"
                                className={btnClass}
                                onClick={() => handleActionClick(act)}
                              >
                                {icon}
                                <span>{act.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <span className="mla-msg-meta">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div className="mla-loading-indicator">
            <div className="mla-loading-spinner"></div>
            <span>Quanta AI is analyzing {symbol.toUpperCase()}...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {suggestedQuestions.length > 0 && (
        <div className="mla-suggested-section">
          <div className="mla-suggested-header">
            <span>Suggested Questions ({symbol.toUpperCase()})</span>
          </div>
          <div className="mla-chips-scroll">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="mla-chip-btn"
                onClick={() => sendMessage(q)}
                disabled={isLoading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mla-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="mla-input-field"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask Quanta AI about ${symbol.toUpperCase()}...`}
          disabled={isLoading}
        />
        <button
          type="button"
          className="mla-send-btn"
          onClick={() => sendMessage()}
          disabled={isLoading || !inputValue.trim()}
          title="Send message"
        >
          <Send size={15} />
        </button>
      </div>

    </div>
  );
};

export default QuantaAdvisor;

