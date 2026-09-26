import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function aggregateRisk({ overduePlans, unpaidContracts }) {
  const empty = overduePlans.length === 0 && unpaidContracts.length === 0;
  return {
    empty,
    overdue_count: overduePlans.length,
    unpaid_count: unpaidContracts.length,
    empty_hint: empty ? '暂无回款风险数据。创建合同并录入回款计划/实收后，逾期项会出现在此。' : null,
  };
}

describe('payment risk aggregation', () => {
  it('honest empty state', () => {
    const r = aggregateRisk({ overduePlans: [], unpaidContracts: [] });
    assert.equal(r.empty, true);
    assert.match(r.empty_hint, /暂无回款风险/);
  });
  it('counts overdue', () => {
    const r = aggregateRisk({ overduePlans: [{ id: 1 }], unpaidContracts: [{ id: 2 }] });
    assert.equal(r.empty, false);
    assert.equal(r.overdue_count, 1);
  });
});
