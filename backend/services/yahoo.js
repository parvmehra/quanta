import yahooFinancePkg from 'yahoo-finance2';

export const yahooFinance = typeof yahooFinancePkg === 'function'
  ? new yahooFinancePkg({ suppressNotices: ['yahooSurvey'] })
  : yahooFinancePkg;

export const VALID_SYMBOL = /^[A-Z0-9.^=&-]{1,20}$/;
