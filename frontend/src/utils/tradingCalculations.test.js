import test from 'node:test';
import assert from 'node:assert';
import { 
  calculateOrderValue, 
  calculateBrokerage, 
  calculateTaxesAndCharges, 
  calculateRequiredMargin, 
  calculateRiskRewardRatio 
} from './tradingCalculations.js';

test('Trading Terminal Core Math Calculations', async (t) => {
  
  await t.test('Order Value calculation should be quantity * price', () => {
    assert.strictEqual(calculateOrderValue(10, 150), 1500);
    assert.strictEqual(calculateOrderValue(5, 42.5), 212.5);
    assert.strictEqual(calculateOrderValue(0, 100), 0);
  });

  await t.test('Brokerage for Intraday (MIS) should be 0.05% of order value, capped at $20', () => {
    assert.strictEqual(calculateBrokerage(1000, 'MIS'), 0.50);
    
    assert.strictEqual(calculateBrokerage(10000, 'MIS'), 5.00);

    assert.strictEqual(calculateBrokerage(50000, 'MIS'), 20.00);
    
    assert.strictEqual(calculateBrokerage(100000, 'MIS'), 20.00);
  });

  await t.test('Brokerage for Delivery (CNC) should always be $0', () => {
    assert.strictEqual(calculateBrokerage(1000, 'CNC'), 0);
    assert.strictEqual(calculateBrokerage(50000, 'CNC'), 0);
  });

  await t.test('Taxes and exchange charges should be 0.03% of order value', () => {
    assert.ok(Math.abs(calculateTaxesAndCharges(1000) - 0.30) < 0.00001);
    
    assert.ok(Math.abs(calculateTaxesAndCharges(5000) - 1.50) < 0.00001);
  });

  await t.test('Required Margin for Intraday (MIS) should be 20% of order value + total charges', () => {
    const orderValue = 1000;
    const brokerageFee = calculateBrokerage(orderValue, 'MIS');
    const taxesAndTaxes = calculateTaxesAndCharges(orderValue);
    const totalCharges = brokerageFee + taxesAndTaxes;
    
    assert.strictEqual(calculateRequiredMargin(orderValue, 'MIS', totalCharges), 200.80);
  });

  await t.test('Required Margin for Delivery (CNC) should be 100% of order value + total charges', () => {
    const orderValue = 1000;
    const brokerageFee = calculateBrokerage(orderValue, 'CNC');
    const taxesAndTaxes = calculateTaxesAndCharges(orderValue);
    const totalCharges = brokerageFee + taxesAndTaxes;
    
    assert.strictEqual(calculateRequiredMargin(orderValue, 'CNC', totalCharges), 1000.30);
  });

  await t.test('Risk/Reward Ratio calculations', () => {
    assert.strictEqual(calculateRiskRewardRatio(110, 95, 100, true, true), "2.00");

    assert.strictEqual(calculateRiskRewardRatio(115, 90, 100, true, true), "1.50");

    assert.strictEqual(calculateRiskRewardRatio(110, 95, 100, false, true), 'N/A');
    assert.strictEqual(calculateRiskRewardRatio(110, 95, 100, true, false), 'N/A');
    assert.strictEqual(calculateRiskRewardRatio(110, 95, 100, false, false), 'N/A');

    assert.strictEqual(calculateRiskRewardRatio(110, 100, 100, true, true), 'N/A');
  });

});
