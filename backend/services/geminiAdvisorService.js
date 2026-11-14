import axios from 'axios';
import dotenv from 'dotenv';
import yahooFinancePkg from 'yahoo-finance2';

const yahooFinance = typeof yahooFinancePkg === 'function' ? new yahooFinancePkg() : yahooFinancePkg;

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// Known peers and competitors for major global and Indian stocks
const PEER_MAP = {
  'AAPL': ['MSFT', 'GOOGL', 'NVDA', 'META', 'AMZN'],
  'MSFT': ['AAPL', 'GOOGL', 'AMZN', 'ORCL', 'IBM'],
  'GOOGL': ['MSFT', 'META', 'AAPL', 'AMZN', 'NVDA'],
  'AMZN': ['WMT', 'MSFT', 'GOOGL', 'BABA', 'TGT'],
  'TSLA': ['RIVN', 'LCID', 'F', 'GM', 'BYDDF'],
  'NVDA': ['AMD', 'INTC', 'TSM', 'QCOM', 'AVGO'],
  'META': ['GOOGL', 'SNAP', 'PINS', 'MSFT', 'AAPL'],
  'NFLX': ['DIS', 'WBD', 'AMZN', 'PARA', 'CMCSA'],
  'RELIANCE.NS': ['TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'ITC.NS'],
  'TCS.NS': ['INFY.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS', 'LTIM.NS'],
  'INFY.NS': ['TCS.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS', 'COFORGE.NS'],
  'HDFCBANK.NS': ['ICICIBANK.NS', 'SBIN.NS', 'KOTAKBANK.NS', 'AXISBANK.NS'],
  'ICICIBANK.NS': ['HDFCBANK.NS', 'SBIN.NS', 'AXISBANK.NS', 'KOTAKBANK.NS'],
  'TATASTEEL.NS': ['JSWSTEEL.NS', 'HINDALCO.NS', 'SAIL.NS', 'JINDALSTEL.NS'],
  'TATAMOTORS.NS': ['MARUTI.NS', 'M&M.NS', 'BAJAJ-AUTO.NS', 'EICHERMOT.NS'],
  'TMCV.NS': ['MARUTI.NS', 'M&M.NS', 'BAJAJ-AUTO.NS', 'EICHERMOT.NS'],
  'TATAPOWER.NS': ['NTPC.NS', 'POWERGRID.NS', 'ADANIPOWER.NS', 'JSWENERGY.NS'],
  'BAJFINANCE.NS': ['BAJAJFINSV.NS', 'HDFCBANK.NS', 'CHOLAFIN.NS', 'SHRIRAMFIN.NS'],
  'WIPRO.NS': ['TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'LTIM.NS'],
};

/**
 * Fetch real news for ticker if available
 */
async function getTickerNews(symbol) {
  try {
    const fetchPromise = yahooFinance.search(symbol, { newsCount: 4 }, { validateResult: false });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
    const news = await Promise.race([fetchPromise, timeoutPromise]);
    if (news && news.news && news.news.length > 0) {
      return news.news.slice(0, 3).map(n => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
      }));
    }
  } catch (e) {
    // news search silent fallback
  }
  return [];
}

/**
 * Build rich system prompt injecting real market data
 */
function buildSystemPrompt(symbol, context, newsList) {
  const isIndian = symbol.toUpperCase().endsWith('.NS') || symbol.toUpperCase().endsWith('.BO') || context?.exchange === 'NSE' || context?.exchange === 'BSE';
  const currencySymbol = isIndian ? '₹' : '$';
  const peers = PEER_MAP[symbol.toUpperCase()] || (isIndian ? ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS'] : ['AAPL', 'MSFT', 'GOOGL']);

  const priceStr = context?.price ? `${currencySymbol}${Number(context.price).toFixed(2)}` : 'N/A';
  const changeStr = context?.changePercent !== undefined 
    ? `${context.changePercent >= 0 ? '+' : ''}${Number(context.changePercent).toFixed(2)}%`
    : 'N/A';
  const highStr = context?.high ? `${currencySymbol}${Number(context.high).toFixed(2)}` : 'N/A';
  const lowStr = context?.low ? `${currencySymbol}${Number(context.low).toFixed(2)}` : 'N/A';
  const openStr = context?.open ? `${currencySymbol}${Number(context.open).toFixed(2)}` : 'N/A';
  const prevCloseStr = context?.previousClose ? `${currencySymbol}${Number(context.previousClose).toFixed(2)}` : 'N/A';
  const rsiStr = context?.rsi ? Number(context.rsi).toFixed(1) : '50.0';
  const smaStr = context?.sma ? `${currencySymbol}${Number(context.sma).toFixed(2)}` : 'N/A';
  const vwapStr = context?.vwap ? `${currencySymbol}${Number(context.vwap).toFixed(2)}` : 'N/A';

  const newsSummary = newsList.length > 0
    ? newsList.map((n, i) => `${i + 1}. "${n.title}" (${n.publisher || 'MarketWire'})`).join('\n')
    : 'No breaking headlines in current session.';

  return `You are MarketLens AI, an institutional-grade financial stock advisor and quantitative research copilot built directly into the MarketLens trading terminal.

CRITICAL INSTRUCTIONS:
1. TRUTHFULNESS & ACCURACY: You must strictly use the verified real-time market data provided below for ${symbol.toUpperCase()}. NEVER invent prices, fake returns, nonexistent volume, or contradictory numbers.
2. CURRENT MARKET DATA FOR ${symbol.toUpperCase()} (${context?.name || symbol}):
   - Instrument: ${symbol.toUpperCase()}
   - Company: ${context?.name || symbol.toUpperCase()}
   - Exchange: ${context?.exchange || (isIndian ? 'NSE' : 'NASDAQ/NYSE')}
   - Currency: ${currencySymbol} (${isIndian ? 'INR' : 'USD'})
   - Current Price: ${priceStr}
   - Day Change: ${changeStr}
   - Day High: ${highStr} | Day Low: ${lowStr}
   - Open: ${openStr} | Previous Close: ${prevCloseStr}
   - RSI (14-period Oscillator): ${rsiStr}
   - SMA (15-period Moving Average): ${smaStr}
   - VWAP: ${vwapStr}
   - Known Industry Peers: ${peers.join(', ')}
   - Recent News Headlines:
${newsSummary}

3. STYLE & FORMAT:
   - Provide concise, insightful, data-driven analysis using clean Markdown.
   - Use bold text for key figures, bullet points for clarity, and short sections.
   - For Buy/Sell/Hold assessments, evaluate RSI, trend momentum, support/resistance levels, and fundamental context.
   - When discussing risks, highlight volatility, indicator divergence, or macro factors.
   - Always clarify that this is quantitative research, not financial solicitation.

4. ACTION TAGS:
   At the very end of your response, you MUST include a JSON metadata block on a single line starting with "<!--ACTIONS:" and ending with "-->" containing relevant interactive actions and 2-3 dynamic follow-up questions.
   Supported actions:
   - {"type": "BUY_ORDER", "label": "Open Buy Order", "symbol": "${symbol.toUpperCase()}"}
   - {"type": "SELL_ORDER", "label": "Open Sell Order", "symbol": "${symbol.toUpperCase()}"}
   - {"type": "SWITCH_STOCK", "label": "Switch to [TICKER]", "symbol": "[TICKER]"}
   - {"type": "VIEW_ANALYSIS", "label": "View Stock Analysis", "symbol": "${symbol.toUpperCase()}"}
   - {"type": "ADD_WATCHLIST", "label": "Add to Watchlist", "symbol": "${symbol.toUpperCase()}"}

   Example JSON block:
   <!--ACTIONS:{"actions":[{"type":"BUY_ORDER","label":"Open Buy Order","symbol":"${symbol.toUpperCase()}"},{"type":"SWITCH_STOCK","label":"Switch to ${peers[0]}","symbol":"${peers[0]}"},{"type":"VIEW_ANALYSIS","label":"View Stock Analysis","symbol":"${symbol.toUpperCase()}"}],"questions":["What is the 1-month price outlook?","How does its RSI compare to ${peers[0]}?","Explain key resistance levels."]}-->
`;
}

/**
 * Intelligent real-market fallback when Gemini API key is absent or limited
 */
function generateAnalyticalFallback(symbol, message, context, newsList, history = []) {
  const sym = symbol.toUpperCase();
  const isIndian = sym.endsWith('.NS') || sym.endsWith('.BO') || context?.exchange === 'NSE' || context?.exchange === 'BSE';
  const curr = isIndian ? '₹' : '$';
  const price = context?.price ? Number(context.price).toFixed(2) : '100.00';
  const changePct = context?.changePercent !== undefined ? Number(context.changePercent).toFixed(2) : '0.00';
  const isPositive = Number(changePct) >= 0;
  const rsi = context?.rsi ? Number(context.rsi).toFixed(1) : '52.4';
  const sma = context?.sma ? Number(context.sma).toFixed(2) : (Number(price) * 0.98).toFixed(2);
  const dayHigh = context?.high ? Number(context.high).toFixed(2) : (Number(price) * 1.02).toFixed(2);
  const dayLow = context?.low ? Number(context.low).toFixed(2) : (Number(price) * 0.98).toFixed(2);
  const prevClose = context?.previousClose ? Number(context.previousClose).toFixed(2) : price;
  const openPrice = context?.open ? Number(context.open).toFixed(2) : price;
  const vwap = context?.vwap ? Number(context.vwap).toFixed(2) : (Number(price) * 0.995).toFixed(2);
  const peers = PEER_MAP[sym] || (isIndian ? ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS'] : ['AAPL', 'MSFT', 'GOOGL']);
  const companyName = context?.name || sym;

  const msgLower = (message || '').toLowerCase();

  // Track what topics were already covered in conversation to avoid repetition
  const pastTopics = new Set();
  if (Array.isArray(history)) {
    history.forEach(h => {
      const content = (h.content || '').toLowerCase();
      if (content.includes('risk assessment')) pastTopics.add('risk');
      if (content.includes('peers & industry') || content.includes('peers \u0026 industry')) pastTopics.add('compare');
      if (content.includes('price movement analysis')) pastTopics.add('movement');
      if (content.includes('research assessment')) pastTopics.add('buysell');
      if (content.includes('marketlens analysis')) pastTopics.add('general');
      if (content.includes('technical deep-dive')) pastTopics.add('technical');
      if (content.includes('support & resistance') || content.includes('support \u0026 resistance')) pastTopics.add('levels');
      if (content.includes('volume & momentum') || content.includes('volume \u0026 momentum')) pastTopics.add('volume');
    });
  }
  const turnCount = Array.isArray(history) ? history.filter(h => h.role === 'user').length : 0;

  let assessment = 'NEUTRAL / HOLD';
  let bias = 'Consolidation';
  if (Number(rsi) < 35) {
    assessment = 'ACCUMULATE / OVERSOLD BUY';
    bias = 'Bullish Reversal Opportunity';
  } else if (Number(rsi) > 70) {
    assessment = 'CAUTION / OVERBOUGHT PROFIT-TAKING';
    bias = 'Bearish Pullback Risk';
  } else if (isPositive) {
    assessment = 'BULLISH CONTINUATION';
    bias = 'Upward Momentum';
  }

  // Computed metrics for deeper analysis variants
  const spread = (Number(dayHigh) - Number(dayLow)).toFixed(2);
  const spreadPct = ((Number(spread) / Number(price)) * 100).toFixed(2);
  const priceVsSma = ((Number(price) - Number(sma)) / Number(sma) * 100).toFixed(2);
  const aboveSma = Number(price) >= Number(sma);
  const gapFromPrevClose = ((Number(price) - Number(prevClose)) / Number(prevClose) * 100).toFixed(2);

  let body = '';
  let actions = [
    { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: sym },
    { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: sym },
    { type: 'VIEW_ANALYSIS', label: 'View Stock Analysis', symbol: sym },
  ];
  let questions = [
    `Should I buy or sell ${sym}?`,
    `What are the major risks for ${sym}?`,
    `Compare ${sym} with ${peers[0]}`,
  ];

  // Determine which category the question falls into
  let category = 'general';
  if (msgLower.includes('risk') || msgLower.includes('danger') || msgLower.includes('downside')) {
    category = 'risk';
  } else if (msgLower.includes('similar') || msgLower.includes('peer') || msgLower.includes('competitor') || msgLower.includes('compare')) {
    category = 'compare';
  } else if (msgLower.includes('price movement') || msgLower.includes('why') || msgLower.includes('news') || msgLower.includes('move')) {
    category = 'movement';
  } else if (msgLower.includes('buy') || msgLower.includes('sell') || msgLower.includes('hold')) {
    category = 'buysell';
  } else if (msgLower.includes('support') || msgLower.includes('resistance') || msgLower.includes('level') || msgLower.includes('target')) {
    category = 'levels';
  } else if (msgLower.includes('volume') || msgLower.includes('momentum') || msgLower.includes('trend')) {
    category = 'volume';
  } else if (msgLower.includes('technical') || msgLower.includes('indicator') || msgLower.includes('rsi') || msgLower.includes('sma') || msgLower.includes('macd')) {
    category = 'technical';
  }

  // If the user asks about the same topic again, provide a deeper / alternate variation
  const isRepeatTopic = pastTopics.has(category);

  if (category === 'risk') {
    if (!isRepeatTopic) {
      body = `### ⚠️ Risk Assessment for ${companyName} (${sym})

- **Indicator Volatility:** RSI is currently **${rsi}**, ${Number(rsi) > 65 ? 'approaching overbought territory, signaling potential short-term pullback risks.' : Number(rsi) < 35 ? 'in oversold territory, which could indicate deep selling pressure before finding a floor.' : 'demonstrating balanced oscillation.'}
- **Support & Resistance Limits:** Immediate downside support sits near **${curr}${dayLow}** (or SMA **${curr}${sma}**). A breach below this level may trigger stop-loss cascades.
- **Circuit Band Safeguards:** Daily 10% bounds restrict excessive swings, with critical resistance capped near **${curr}${dayHigh}**.
- **Market Sensitivity:** As an active constituent in ${isIndian ? 'NIFTY / Sensex' : 'S&P 500 / NASDAQ'}, broader macroeconomic shifts and interest rate expectations directly impact institutional liquidity.

*Tip: Consider configuring bracket stop-loss orders in the Trade panel to protect capital against sudden gap-downs.*`;
    } else {
      body = `### 🛡️ Extended Risk Profile — ${companyName} (${sym})

Building on the earlier assessment, here is a deeper look at risk factors:

- **Intraday Volatility Spread:** Today's range of **${curr}${spread}** represents a **${spreadPct}%** swing — ${Number(spreadPct) > 3 ? 'elevated volatility that warrants tighter risk controls.' : 'normal trading range within acceptable bounds.'}
- **Gap Analysis:** Price opened at **${curr}${openPrice}** vs previous close **${curr}${prevClose}** — a ${Number(gapFromPrevClose) >= 0 ? 'gap-up' : 'gap-down'} of **${gapFromPrevClose}%**. ${Math.abs(Number(gapFromPrevClose)) > 1.5 ? 'Significant gaps often retest the opening level intraday.' : 'Modest gap suggests orderly price discovery.'}
- **SMA Deviation Risk:** Price is currently **${priceVsSma}%** ${aboveSma ? 'above' : 'below'} the 15-day SMA. ${Math.abs(Number(priceVsSma)) > 3 ? 'Extended deviation from the mean increases reversion probability.' : 'Price remains within typical oscillation bands.'}
- **Tail Risk Scenario:** In a worst-case single-session drawdown of 5%, your position would face a **${curr}${(Number(price) * 0.05).toFixed(2)}** per-share loss. Size your position accordingly.

*Use the bracket order feature in the Trade panel to set automatic stop-loss and take-profit levels.*`;
    }
    actions.push({ type: 'ADD_WATCHLIST', label: 'Add to Watchlist', symbol: sym });
    questions = isRepeatTopic
      ? [`How should I hedge my ${sym} position?`, `What is the maximum drawdown scenario?`, `Compare risk with ${peers[0]}`]
      : [`What is a safe stop loss price?`, `Find defensive alternatives to ${sym}`, `How do institutional buyers view this?`];

  } else if (category === 'compare') {
    if (!isRepeatTopic) {
      body = `### 🔍 Peers & Industry Alternatives for ${companyName} (${sym})

Here is how **${sym}** compares with leading industry counterparts:

| Ticker | Focus / Market Standing | Trade Action |
| :--- | :--- | :--- |
| **${peers[0]}** | Direct sector peer with high liquidity | [Switch to ${peers[0]}](#) |
| **${peers[1] || peers[0]}** | Competitor with balanced valuation | [Switch to ${peers[1] || peers[0]}](#) |
| **${peers[2] || peers[0]}** | Growth alternate with momentum | [Switch to ${peers[2] || peers[0]}](#) |

- **Current Comparison:** ${sym} trades at **${curr}${price}** (${changePct >= 0 ? '+' : ''}${changePct}%), whereas ${peers[0]} offers a comparable risk/reward profile in the current market cycle.
- **Sector Outlook:** Both equities show synchronized momentum based on ongoing industry volume flows.`;
    } else {
      body = `### 📊 Deeper Competitive Analysis — ${sym} vs Peers

Expanding on the earlier comparison:

- **Valuation Context:** At **${curr}${price}**, ${sym} is trading ${aboveSma ? 'above' : 'below'} its 15-day moving average (**${curr}${sma}**), suggesting ${aboveSma ? 'relative strength vs peers' : 'potential value entry vs peers'}.
- **Momentum Comparison:** With an RSI of **${rsi}**, ${sym} shows ${Number(rsi) > 55 ? 'stronger momentum' : 'weaker momentum'} than the sector average. Consider comparing directly with ${peers[3] || peers[0]} and ${peers[4] || peers[1] || peers[0]} for diversification.
- **Full Peer Universe:** ${peers.join(', ')}
- **Diversification Tip:** Rather than concentrating in one name, consider a basket approach across 2-3 peers to reduce idiosyncratic risk.

Want me to analyze a specific peer in detail?`;
    }
    actions = [
      { type: 'SWITCH_STOCK', label: `Switch to ${peers[0]}`, symbol: peers[0] },
      { type: 'SWITCH_STOCK', label: `Switch to ${peers[1] || peers[0]}`, symbol: peers[1] || peers[0] },
      { type: 'VIEW_ANALYSIS', label: 'View Stock Analysis', symbol: sym },
    ];
    questions = isRepeatTopic
      ? [`Which peer has the best risk-reward?`, `Analyze ${peers[2] || peers[0]} in detail`, `Build a sector basket strategy`]
      : [`Compare ${sym} vs ${peers[0]} financials`, `Which has higher growth potential?`, `Should I diversify across both?`];

  } else if (category === 'movement') {
    if (!isRepeatTopic) {
      body = `### 📈 Price Movement Analysis: ${sym} (${companyName})

- **Current Session Status:** ${sym} is trading at **${curr}${price}**, registering a **${changePct >= 0 ? '+' : ''}${changePct}%** shift from the previous close (**${curr}${prevClose}**).
- **Intraday Range:** Range spans from **${curr}${dayLow}** to **${curr}${dayHigh}**, indicating active price discovery.
- **Technical Driver:** Price is ${aboveSma ? 'holding comfortably above' : 'testing support near'} its 15-period Simple Moving Average (**${curr}${sma}**).
- **Recent Catalysts:** ${newsList.length > 0 ? `Headlines such as *"${newsList[0].title}"* are shaping investor sentiment.` : 'Broad index sentiment and order book volumes are driving current momentum.'}`;
    } else {
      body = `### 🔬 Detailed Session Breakdown — ${sym}

Let me add more color to the price action:

- **Opening Gap:** Opened at **${curr}${openPrice}** vs prev close **${curr}${prevClose}** — a ${Number(gapFromPrevClose) >= 0 ? 'positive' : 'negative'} gap of **${gapFromPrevClose}%**.
- **Range Development:** The session has carved out a **${curr}${spread}** range (**${spreadPct}%**), ${Number(spreadPct) > 2.5 ? 'indicating elevated intraday activity — possible institutional rotation.' : 'within a normal daily profile.'}
- **VWAP Relationship:** VWAP at **${curr}${vwap}** — price trading ${Number(price) >= Number(vwap) ? 'above VWAP suggests bullish institutional flow' : 'below VWAP suggests selling pressure from larger participants'}.
- **SMA Proximity:** Currently **${priceVsSma}%** ${aboveSma ? 'above' : 'below'} the 15-SMA. ${Math.abs(Number(priceVsSma)) > 2 ? 'This extended move may attract mean-reversion traders.' : 'Staying close to the mean, watch for a directional breakout.'}
${newsList.length > 1 ? `- **Additional Catalyst:** *"${newsList[1].title}"* (${newsList[1].publisher || 'MarketWire'})` : ''}`;
    }
    questions = isRepeatTopic
      ? [`Is this move sustainable?`, `What is the VWAP target?`, `Will the gap get filled?`]
      : [`Will momentum continue into next session?`, `Is this a breakout or fakeout?`, `Where should I enter?`];

  } else if (category === 'buysell') {
    if (!isRepeatTopic) {
      body = `### ⚖️ Research Assessment: ${companyName} (${sym})

**Recommendation Bias:** **${assessment}** (${bias})

- **Technical Signal:** RSI stands at **${rsi}**. ${Number(rsi) < 40 ? 'Oversold readings favor an attractive risk/reward entry for long positions.' : Number(rsi) > 68 ? 'Overbought conditions suggest locking in partial profits or waiting for a pullback.' : 'Momentum is balanced between buyers and sellers.'}
- **Key Levels to Watch:**
  - **Support:** **${curr}${sma}** (SMA 15) & **${curr}${dayLow}** (Day Low)
  - **Resistance / Target:** **${curr}${dayHigh}** (Day High)
- **Trade Execution Suggestion:**
  - If entering a **BUY**, set a protective stop loss near **${curr}${dayLow}**.
  - If holding a **SELL / SHORT**, watch for resistance rejection near **${curr}${dayHigh}**.

*Review the Order Panel on the left to set your preferred Quantity, Product Type (MIS/CNC), and Bracket limits.*`;
    } else {
      const targetUp = (Number(price) * 1.03).toFixed(2);
      const targetDown = (Number(price) * 0.97).toFixed(2);
      const stopLoss = (Number(dayLow) * 0.995).toFixed(2);
      body = `### 📋 Updated Trade Setup — ${companyName} (${sym})

Refining the earlier recommendation based on current session dynamics:

**Current Bias:** **${assessment}**

- **Entry Zone:** ${aboveSma ? `Consider buying on dips toward **${curr}${sma}** (SMA 15) for optimal entry.` : `Wait for a close above **${curr}${sma}** before initiating long positions.`}
- **Profit Targets:**
  - **T1 (Conservative):** **${curr}${dayHigh}** (session high)
  - **T2 (Extended):** **${curr}${targetUp}** (+3% from current)
- **Stop Loss:** **${curr}${stopLoss}** (just below day low)
- **Risk-Reward Ratio:** Approx. **1:${((Number(targetUp) - Number(price)) / (Number(price) - Number(stopLoss))).toFixed(1)}** — ${((Number(targetUp) - Number(price)) / (Number(price) - Number(stopLoss))) >= 2 ? 'favorable setup' : 'monitor closely, tight risk management required'}.
- **Position Sizing Tip:** Risk no more than 1-2% of your capital per trade. At current price, this implies a max position of ~${Math.max(1, Math.floor(Number(price) > 0 ? 500 / Number(price) : 10))} shares for a $500 risk budget.

Use **Bracket Orders** in the Trade panel to automate your entry/SL/TP.`;
    }
    actions = [
      { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: sym },
      { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: sym },
      { type: 'ADD_WATCHLIST', label: 'Add to Watchlist', symbol: sym },
    ];
    questions = isRepeatTopic
      ? [`What position size should I use?`, `Set up a bracket order for ${sym}`, `When should I exit?`]
      : [`What is the risk-reward ratio?`, `Explain support and resistance levels`, `Find similar stocks to ${sym}`];

  } else if (category === 'levels') {
    body = `### 📐 Support & Resistance Levels — ${companyName} (${sym})

| Level | Price | Significance |
| :--- | :--- | :--- |
| **Resistance 2** | **${curr}${(Number(dayHigh) * 1.015).toFixed(2)}** | Extended upside target |
| **Resistance 1** | **${curr}${dayHigh}** | Session high / immediate ceiling |
| **Current Price** | **${curr}${price}** | ${changePct >= 0 ? '▲' : '▼'} ${changePct}% |
| **Support 1 (SMA)** | **${curr}${sma}** | 15-period moving average |
| **Support 2** | **${curr}${dayLow}** | Session low / critical floor |
| **Support 3** | **${curr}${(Number(dayLow) * 0.985).toFixed(2)}** | Extended downside risk |

- **VWAP:** **${curr}${vwap}** — ${Number(price) >= Number(vwap) ? 'bullish positioning above value area' : 'trading below value, watch for reclaim'}.
- **Interpretation:** ${aboveSma ? 'Price above SMA suggests buyers are in control. Look for bounces off support levels for entry.' : 'Price below SMA indicates sellers dominating. Watch for resistance rejection for shorts.'}`;
    questions = [`How do I trade these levels?`, `What happens if support breaks?`, `Find the next breakout target`];

  } else if (category === 'volume') {
    body = `### 📊 Volume & Momentum Profile — ${companyName} (${sym})

- **Session Trend:** Price action shows **${bias}** characteristics with the session moving **${changePct >= 0 ? '+' : ''}${changePct}%** from open.
- **RSI Momentum:** At **${rsi}**, the oscillator indicates ${Number(rsi) > 60 ? 'strong buying pressure' : Number(rsi) < 40 ? 'dominant selling pressure' : 'balanced momentum between buyers and sellers'}.
- **Price vs VWAP:** Trading ${Number(price) >= Number(vwap) ? 'above' : 'below'} VWAP (**${curr}${vwap}**) — ${Number(price) >= Number(vwap) ? 'suggesting institutional accumulation during this session' : 'indicating distribution or profit-taking by larger participants'}.
- **Trend Strength:** SMA deviation of **${priceVsSma}%** ${aboveSma ? 'above' : 'below'} average — ${Math.abs(Number(priceVsSma)) > 2 ? 'strong trend in progress, but watch for exhaustion' : 'trend is developing, not yet extended'}.
- **Outlook:** ${isPositive ? 'Bullish momentum intact. Look for higher highs and higher lows pattern continuation.' : 'Bearish pressure present. Monitor for lower highs confirming downtrend.'}`;
    questions = [`Is the trend strong enough to continue?`, `Where should I place my stop loss?`, `Compare momentum with ${peers[0]}`];

  } else if (category === 'technical') {
    body = `### 🔧 Technical Deep-Dive — ${companyName} (${sym})

#### Oscillators & Moving Averages
- **RSI (14):** **${rsi}** — ${Number(rsi) > 70 ? '🔴 Overbought zone. Potential reversal or consolidation ahead.' : Number(rsi) < 30 ? '🟢 Oversold zone. Potential bounce opportunity.' : Number(rsi) > 55 ? '🟡 Bullish momentum building.' : Number(rsi) < 45 ? '🟡 Bearish pressure increasing.' : '⚪ Neutral territory.'}
- **SMA (15):** **${curr}${sma}** — Price is **${priceVsSma}%** ${aboveSma ? 'above' : 'below'}. ${aboveSma ? 'Bullish bias confirmed.' : 'Watch for crossover to confirm trend change.'}
- **VWAP:** **${curr}${vwap}** — ${Number(price) >= Number(vwap) ? 'Institutional buyers appear active.' : 'Distribution pattern detected.'}

#### Price Structure
- **Day Range:** **${curr}${dayLow}** – **${curr}${dayHigh}** (spread: **${curr}${spread}**, **${spreadPct}%**)
- **Gap from Previous Close:** **${gapFromPrevClose}%** — ${Math.abs(Number(gapFromPrevClose)) > 1 ? 'Significant gap may act as magnet for price retest.' : 'Clean open within prior range.'}

#### Signal Summary
| Indicator | Value | Signal |
| :--- | :--- | :--- |
| RSI (14) | ${rsi} | ${Number(rsi) > 60 ? 'Bullish' : Number(rsi) < 40 ? 'Bearish' : 'Neutral'} |
| SMA (15) | ${curr}${sma} | ${aboveSma ? 'Bullish' : 'Bearish'} |
| VWAP | ${curr}${vwap} | ${Number(price) >= Number(vwap) ? 'Bullish' : 'Bearish'} |
| **Overall** | — | **${assessment}** |`;
    questions = [`What does the RSI divergence suggest?`, `Should I use SMA crossover strategy?`, `Explain the volume profile`];

  } else {
    // General / Comprehensive Analysis — varies based on repeat
    if (!isRepeatTopic) {
      body = `### 📊 MarketLens Analysis: ${companyName} (${sym})

- **Market Pulse:** Currently priced at **${curr}${price}** (${changePct >= 0 ? '+' : ''}${changePct}%), within day bounds of **${curr}${dayLow}** – **${curr}${dayHigh}**.
- **Trend & Moving Average:** Price is trading ${aboveSma ? 'above' : 'below'} the 15-day SMA (**${curr}${sma}**), reflecting a **${isPositive ? 'bullish' : 'consolidating'}** stance.
- **RSI Strength:** The 14-period Relative Strength Index is **${rsi}**, signaling **${bias}**.
- **Actionable Takeaway:** Technical setup points to **${assessment}**. Investors looking for active positions can review intraday orders or delivery margin requirements on the trading terminal.`;
    } else {
      body = `### 🧠 Further Insights — ${companyName} (${sym})

Here is additional context beyond the earlier overview:

- **Session Dynamics:** Opened at **${curr}${openPrice}** with a gap of **${gapFromPrevClose}%** from previous close. Current range is **${curr}${spread}** wide (**${spreadPct}%**).
- **VWAP Context:** At **${curr}${vwap}**, institutional value area ${Number(price) >= Number(vwap) ? 'supports the current price level' : 'sits above current price, suggesting overhead supply'}.
- **Peer Comparison Context:** Among peers (${peers.slice(0, 3).join(', ')}), ${sym} is showing ${isPositive ? 'relative strength' : 'relative weakness'} this session.
- **Key Question:** ${Number(rsi) > 60 ? 'Can bulls sustain momentum above the SMA, or will profit-taking kick in?' : Number(rsi) < 40 ? 'Is the selling exhausted? Watch for reversal signals near support.' : 'Which direction will the breakout favor? Volume will be the deciding factor.'}
${newsList.length > 0 ? `
- **Latest Headline:** *"${newsList[0].title}"* — ${newsList[0].publisher || 'MarketWire'}` : ''}`;
    }
    actions.push({ type: 'SWITCH_STOCK', label: `Compare with ${peers[0]}`, symbol: peers[0] });
    questions = isRepeatTopic
      ? [`Dive deeper into technical indicators`, `What are the key catalysts ahead?`, `Explain the order flow dynamics`]
      : [`Should I buy, sell, or hold ${sym}?`, `What are its main risks?`, `Find similar stocks`];
  }

  const actionPayload = JSON.stringify({ actions, questions });
  const fullResponse = `${body}\n\n<!--ACTIONS:${actionPayload}-->`;

  return {
    response: fullResponse,
    suggestedActions: actions,
    suggestedQuestions: questions,
    isFallback: true,
  };
}

/**
 * Main service method to process user questions with Gemini API
 */
export async function getGeminiAdvisorResponse({ symbol, message, history = [], context = {} }) {
  const sym = (symbol || 'AAPL').toUpperCase();
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || GEMINI_API_KEY || '').trim();

  // Fetch real headlines to ground the model
  const newsList = await getTickerNews(sym);

  // If Gemini API key is not configured, return high-accuracy real-data analytical fallback
  if (!apiKey) {
    console.log(`ℹ️ GEMINI_API_KEY not found. Using grounded analytical advisor engine for ${sym}.`);
    return generateAnalyticalFallback(sym, message, context, newsList, history);
  }

  const systemInstruction = buildSystemPrompt(sym, context, newsList);

  // Format conversation history for Gemini API
  const formattedContents = [];

  // Add previous turns if provided
  if (Array.isArray(history)) {
    history.slice(-6).forEach(item => {
      if (item && item.role && item.content) {
        // Strip out actions tag from prompt history
        const cleanContent = item.content.replace(/<!--ACTIONS:[\s\S]*?-->/g, '').trim();
        formattedContents.push({
          role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: cleanContent }]
        });
      }
    });
  }

  // Add the current user query with contextual reminder
  formattedContents.push({
    role: 'user',
    parts: [{
      text: `Context for currently selected stock: ${sym}. User query: ${message}`
    }]
  });

  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash'
  ];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const payload = {
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: formattedContents,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 1200,
        }
      };

      const res = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      const candidate = res.data?.candidates?.[0];
      const textOutput = candidate?.content?.parts?.[0]?.text;

      if (textOutput && textOutput.trim()) {
        console.log(`✅ Gemini response generated via model: ${model} for ${sym}`);
        // Extract actions metadata if embedded
        let actions = [];
        let questions = [];

        const actionMatch = textOutput.match(/<!--ACTIONS:([\s\S]*?)-->/);
        if (actionMatch && actionMatch[1]) {
          try {
            const parsed = JSON.parse(actionMatch[1]);
            actions = parsed.actions || [];
            questions = parsed.questions || [];
          } catch (e) {
            console.warn("Could not parse actions JSON from model response", e);
          }
        }

        // Default actions if none provided by model
        if (!actions || actions.length === 0) {
          actions = [
            { type: 'BUY_ORDER', label: 'Open Buy Order', symbol: sym },
            { type: 'SELL_ORDER', label: 'Open Sell Order', symbol: sym },
            { type: 'VIEW_ANALYSIS', label: 'View Stock Analysis', symbol: sym },
          ];
        }

        if (!questions || questions.length === 0) {
          questions = [
            `What are the main risks for ${sym}?`,
            `Find similar stocks to ${sym}`,
            `Explain its recent price movement`,
          ];
        }

        return {
          response: textOutput,
          suggestedActions: actions,
          suggestedQuestions: questions,
          modelUsed: model,
        };
      }
    } catch (err) {
      console.warn(`⚠️ Model ${model} failed: ${err.response?.data?.error?.message || err.message}`);
      // continue to next model in list
    }
  }

  // If Gemini calls failed or timed out, use intelligent analytical fallback grounded in real metrics
  console.warn(`Falling back to local analytical engine for ${sym}`);
  return generateAnalyticalFallback(sym, message, context, newsList, history);
}

