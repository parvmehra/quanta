# Trading engine

All trading, wallet and portfolio state is server-side in MongoDB. The browser only sends intent (symbol, side, type, quantity, optional limit/stop price and a client order id). The server decides the price, checks funds and holdings, and records everything.

Code: `backend/services/tradeService.js`, routes in `backend/routes/tradingRoutes.js` and `walletRoutes.js`, models in `backend/models/`.

## Rules

- **Simulated.** No real orders, no payment gateway. The UI labels orders and funds as simulated.
- **Prices.** Fills use the latest quote fetched by the server from Yahoo Finance (may be delayed). Client-supplied prices, balances or user ids are ignored. Only stocks and ETFs are tradable; indices are rejected. If no live price is available the order is refused (`503 PRICE_UNAVAILABLE`), never filled at an estimate.
- **Currencies.** Symbols ending in `.NS` or `.BO` use the INR wallet, all others the USD wallet. There is no currency conversion and the two are never added together. New wallets start with 500,000 USD and 5,000,000 INR (simulated).
- **Quantity.** Positive, at most 4 decimals, at most 1,000,000.
- **Fee.** 0.03% of the order value on both buys and sells, rounded to the nearest cent. No brokerage and no leverage.
- **Average cost** is share-weighted and includes buy fees: `(oldQty*oldAvg + qty*price + fee) / newQty`. Selling does not change it.
- **Realised P&L** on a sell = proceeds after fee minus `avgCost * quantity`.
- **Money precision.** Balances, fees and ledger amounts are stored as integer minor units (cents/paise).

## Order types

| Type | Behaviour |
|---|---|
| MARKET | Fills immediately at the server-side price. When the market is closed it fills at the last available price. |
| LIMIT | Rests as OPEN. Buy fills when price ≤ limit, sell when price ≥ limit. A marketable limit fills immediately. |
| STOP | Rests as OPEN. Sell (stop-loss) triggers when price ≤ stop, buy when price ≥ stop. |

Resting orders are checked every 20 seconds by an in-process matcher (`runMatcher`, started in `index.js`, only while MongoDB is connected). They fill at the price seen by the matcher. Funds and holdings are checked again at fill time; if they are no longer sufficient the order becomes REJECTED.

Statuses: OPEN, FILLED, CANCELLED, REJECTED. Rejected orders are kept for audit.

## Integrity guarantees

- Every fill, deposit and import runs in a MongoDB multi-document transaction (wallet, holding, order and ledger change together or not at all). Requires a replica set; Atlas free clusters qualify.
- Buys debit the wallet with a conditional update (`balance >= total`), so concurrent orders cannot overspend. Sells re-read the holding inside the transaction, so they cannot oversell.
- `clientOrderId` (unique per user) makes submissions idempotent. Resubmitting the same id returns the original order and never executes twice.
- The ledger is append-only. For each user and currency, the sum of ledger amounts equals the wallet balance (asserted in the tests).
- Ownership: every query is scoped to the authenticated user id taken from the verified token.
- Deposits are simulated, capped at 1,000,000 per request and 5,000,000 per day per currency, and have no client-supplied reference.

## Collections

| Collection | Key fields |
|---|---|
| `wallets` | `_id` = user id, `balances.USD`, `balances.INR` (minor units) |
| `holdings` | `userId`, `symbol`, `currency`, `quantity`, `avgCost` (unique per user and symbol) |
| `orders` | `userId`, `clientOrderId` (unique with user), symbol, side, type, quantity, limit/stop price, status, fill price, value, fee, realised P&L |
| `ledgerentries` | `userId`, `kind` (INITIAL, DEPOSIT, BUY, SELL, IMPORT), `currency`, `amount`, `balanceAfter`, order reference |

Users, notification logs, chat messages and alert subscriptions are still stored in the local JSON file; they are the next migration step.

## API (all require login)

| Method and path | Purpose |
|---|---|
| `POST /api/orders` | Place an order. 201 created, 200 duplicate, 400 invalid input, 422 rejected (funds/holdings), 503 no price |
| `GET /api/orders?status=&limit=` | List own orders |
| `DELETE /api/orders/:id` | Cancel an OPEN order (409 if not open) |
| `GET /api/positions` | Holdings plus realised P&L per currency |
| `GET /api/ledger?kind=&limit=` | Own ledger entries |
| `GET /api/wallet` | Balances, limits and the latest ledger entries |
| `POST /api/wallet/topup` | Simulated deposit `{currency, amount}` |
| `POST /api/portfolio/import` | Import up to 500 holdings from a parsed CSV (no wallet change) |

`503 DB_UNAVAILABLE` is returned by these routes when MongoDB is not connected; the rest of the app keeps working.

## Tests

`cd backend && npm test` runs 20 engine tests against the configured database using throw-away user ids (they delete their data afterwards). They cover invalid input, insufficient funds, overselling, duplicate and concurrent submissions, concurrent buys and sells, weighted cost and realised P&L, limit and stop orders, cancellation and ownership, deposits and imports, and the ledger-equals-balance invariant.
