const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

let portfolio = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    shares: 10,
    avgPrice: 150.75,
  },
  {
    id: '2',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    shares: 5,
    avgPrice: 2800.0,
  },
  {
    id: '3',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    shares: 8,
    avgPrice: 305.5,
  },
];



const getPortfolio = async (req, res) => {
  try {
    const portfolioWithFallbackData = portfolio.map((item) => {
      const currentPrice = item.avgPrice; 
      const totalValue = item.shares * currentPrice;
      const gainLoss = totalValue - item.shares * item.avgPrice;
      const gainLossPercent = (gainLoss / (item.shares * item.avgPrice)) * 100;

      return {
        ...item,
        currentPrice,
        totalValue,
        gainLoss,
        gainLossPercent,
      };
    });
    res.json(portfolioWithFallbackData);
  } catch (error) {
    res.status(500).json({ message: 'Server error while fetching portfolio data' });
  }
};

const getPortfolioItem = (req, res) => {
    const item = portfolio.find((p) => p.id === req.params.id);
    if (item) {
        res.json(item);
    } else {
        res.status(404).json({ message: 'Portfolio item not found' });
    }
}


const addStock = (req, res) => {
  const { symbol, shares, avgPrice } = req.body;

  if (!symbol || !shares || !avgPrice) {
    return res.status(400).json({ message: 'Please provide symbol, shares, and average price' });
  }

  const newItem = {
    id: uuidv4(),
    symbol: symbol.toUpperCase(),
    name: `${symbol.toUpperCase()} Inc.`,
    shares: parseFloat(shares),
    avgPrice: parseFloat(avgPrice),
  };

  portfolio.push(newItem);
  res.status(201).json(newItem);
};

const updateStock = (req, res) => {
  const { id } = req.params;
  const { shares, avgPrice } = req.body;

  const itemIndex = portfolio.findIndex((item) => item.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Portfolio item not found' });
  }
  
  if (shares !== undefined) {
      portfolio[itemIndex].shares = parseFloat(shares);
  }
  if (avgPrice !== undefined) {
      portfolio[itemIndex].avgPrice = parseFloat(avgPrice);
  }

  res.json(portfolio[itemIndex]);
};


const deleteStock = (req, res) => {
  const { id } = req.params;
  const initialLength = portfolio.length;
  portfolio = portfolio.filter((item) => item.id !== id);

  if (portfolio.length === initialLength) {
    return res.status(404).json({ message: 'Portfolio item not found' });
  }

  res.status(200).json({ message: 'Stock removed successfully' });
};

module.exports = {
  getPortfolio,
  getPortfolioItem,
  addStock,
  updateStock,
  deleteStock,
};
