'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const budget = require('../dist/learning.js');
const retention = require('../dist/retention.js');
const json = value => JSON.stringify(value);
const copy = value => JSON.parse(json(value));
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze)}
  return value;
}
function game(extra = {}) {
  return {year: 2026, money: 100, grades: [5, 5, 5, 5, 5, 5], special: .6, happy: 60, rep: 50, teacher: 60, facilities: 50, appeal: 0, points: [{year: 2026, total: 31}], history: [{year: 2026, title: 'Existing annual choice'}], organization: {combinedGroups: [], ending: null}, lifecycle: {ending: null}, done: false, ...extra};
}
function reconcile(state, current) {
  const summary = budget.summary(state);
  assert.equal(summary.recordedBalance, current.money);
  assert.equal(summary.startBalance + summary.policyInflow - summary.policySpending - summary.retentionSpending + summary.allocationNet + summary.supportTotal, current.money);
  assert.equal(summary.entryCount, state.entries.length);
  assert.equal(summary.grantCount, state.grants.length);
  assert.deepEqual(budget.normalize(copy(state), current), state);
  assert.ok(state.entries.every(entry => Number.isFinite(entry.amount) && Number.isFinite(entry.balanceAfter)));
}
function record(state, before, after, id, kind) {
  const originalState = json(state), originalBefore = json(before), originalAfter = json(after);
  const result = budget.record(freeze(state), {id, year: after.year, kind, label: 'Actual recorded flow'}, freeze(before), freeze(after));
  assert.ok(result.accepted, result.message);
  assert.equal(json(state), originalState);
  assert.equal(json(before), originalBefore);
  assert.equal(json(after), originalAfter);
  assert.equal(result.state.entries.at(-1).amount, after.money - before.money);
  reconcile(result.state, after);
  return result.state;
}

const globalApi = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/learning.js'), 'utf8') + '\nObject.keys(BudgetModel);');
assert.deepEqual(Array.from(globalApi), ['initial', 'normalize', 'canAfford', 'record', 'support', 'summary']);
const startGame = freeze(game()), start = freeze(budget.initial(startGame));
assert.deepEqual(start, {version: 1, start: {year: 2026, balance: 100, legacy: false}, entries: [], grants: []});
assert.deepEqual(budget.normalize(null, game({year: 2031, money: -50})), {version: 1, start: {year: 2031, balance: -50, legacy: true}, entries: [], grants: []});
assert.equal(budget.normalize({version: 999}, game({money: -23})).start.balance, -23);
assert.equal(budget.normalize(null, game()).entries.length, 0, 'No unknown past flows are backfilled');
for (const money of [-50, -1, 0, 6, 12, 100]) {
  assert.equal(budget.canAfford({money}, 0), true, 'Free choices stay available with legacy debt');
  for (const cost of [6, 12, 18, 25]) assert.equal(budget.canAfford({money}, cost), money >= cost);
}
for (const cost of [-1, NaN, Infinity, '12', undefined]) assert.equal(budget.canAfford(game(), cost), false);
for (const money of [NaN, Infinity, '100', undefined]) assert.equal(budget.canAfford({money}, 0), false);

let current = game(), state = budget.initial(current);
let next = {...current, money: 82, rep: 62};
state = record(state, current, next, 'policy:2026:declining-intake', 'policy'); current = next;
const duplicate = budget.record(state, {id: 'policy:2026:declining-intake', year: 2026, kind: 'policy'}, current, {...current, money: 64});
assert.equal(duplicate.accepted, false); assert.deepEqual(duplicate.state, state);
next = {...current, money: 76};
state = record(state, current, next, 'retention:2026', 'retention'); current = next;
next = {...current, year: 2027, money: 96};
state = record(state, current, next, 'allocation:2027', 'allocation'); current = next;
next = {...current, money: 106};
state = record(state, current, next, 'policy:2027:status-quo', 'policy'); current = next;
const supportBefore = freeze(copy(current)), supportState = freeze(copy(state));
const support = budget.support(supportState, supportBefore, 'learning');
assert.ok(support.accepted); assert.equal(support.game.money, 130);
assert.deepEqual({...support.game, money: supportBefore.money}, supportBefore, 'Support cannot create students or change game metrics/history');
assert.equal(json(supportBefore), json(current)); assert.equal(json(supportState), json(state));
state = support.state; current = support.game;
reconcile(state, current);
assert.deepEqual(budget.summary(state), {startBalance: 100, policyInflow: 10, policySpending: 18, retentionSpending: 6, allocationNet: 20, supportTotal: 24, recordedBalance: 130, entryCount: 5, grantCount: 1, nextSupportYear: 2030, remainingGrants: 2});
assert.deepEqual(state.grants[0], state.entries.at(-1));
assert.equal(budget.support(state, current, 'transport').accepted, false, 'Double click cannot receive another purpose grant');
assert.equal(budget.support(copy(state), copy(current), 'learning').accepted, false, 'Reload cannot duplicate a grant');
assert.equal(budget.support(state, {...current, year: 2029}, 'transport').accepted, false);
const second = budget.support(state, {...current, year: 2030}, 'transport');
assert.ok(second.accepted); assert.equal(second.game.money, 154);
const third = budget.support(second.state, {...second.game, year: 2033}, 'shared-curriculum');
assert.ok(third.accepted); assert.equal(third.game.money, 178);
assert.equal(budget.support(third.state, {...third.game, year: 2036}, 'learning').accepted, false);
assert.equal(budget.summary(third.state).remainingGrants, 0);
assert.deepEqual(budget.normalize(copy(third.state), third.game), third.state);
for (const purpose of ['unknown', '', null, undefined, 'sharedcurriculum']) assert.equal(budget.support(start, startGame, purpose).accepted, false);
for (const extra of [{done: true}, {organization: {ending: {kind: 'closed'}}}, {organization: {ending: {kind: 'merged'}}}, {organization: {ending: {kind: 'zero-enrollment'}}}, {lifecycle: {ending: {changeId: 'official'}}}]) assert.equal(budget.support(start, game(extra), 'learning').accepted, false);

const debt = freeze(game({year: 2031, money: -50})), debtState = freeze(budget.normalize(null, debt));
assert.equal(debtState.start.legacy, true);
const debtSupport = budget.support(debtState, debt, 'transport');
assert.ok(debtSupport.accepted); assert.equal(debtSupport.game.money, -26);
reconcile(debtSupport.state, debtSupport.game);
let debtAfter = {...debt, money: -40};
let debtFlows = record(debtState, debt, debtAfter, 'policy:2031:inflow', 'policy');
const freeChoice = record(debtFlows, debtAfter, {...debtAfter}, 'retention:2031:monitor', 'retention');
assert.equal(freeChoice.entries.at(-1).amount, 0);
assert.equal(budget.record(debtFlows, {id: 'policy:2031:overspend', year: 2031, kind: 'policy'}, debtAfter, {...debtAfter, money: -46}).accepted, false);
assert.equal(budget.record(start, {id: 'policy:2026:overspend', year: 2026, kind: 'policy'}, startGame, {...startGame, money: -1}).accepted, false);

// Existing allocation clamp remains a recorded actual flow, including cap adjustments.
for (const [beforeMoney, nominal, expected] of [[245, 20, 250], [-50, -10, -50], [-50, 20, -30], [274, 20, 250]]) {
  const before = game({money: beforeMoney}), ledger = budget.initial(before), after = {...before, year: 2027, money: Math.max(-50, Math.min(250, before.money + nominal))};
  assert.equal(after.money, expected);
  const allocated = record(ledger, before, after, 'allocation:2027', 'allocation');
  assert.equal(allocated.entries[0].amount, expected - beforeMoney);
}
const finalBefore = game({year: 2044}), finalAfter = {...finalBefore, year: 2045, money: 120, done: true};
record(budget.initial(finalBefore), finalBefore, finalAfter, 'allocation:2045', 'allocation');
const highBalance = game({money: 245}), highSupport = budget.support(budget.initial(highBalance), highBalance, 'learning');
assert.ok(highSupport.accepted); assert.equal(highSupport.game.money, 269, 'Support is the exact +24 game amount without a new eligibility cap');
const cappedAfterSupport = {...highSupport.game, year: 2027, money: Math.min(250, highSupport.game.money + 20)};
const capLedger = record(highSupport.state, highSupport.game, cappedAfterSupport, 'allocation:2027', 'allocation');
assert.equal(capLedger.entries.at(-1).amount, -19, 'The existing annual cap adjustment is included in the actual allocation net');
assert.equal(budget.support(budget.initial(game({money: Number.MAX_VALUE})), game({money: Number.MAX_VALUE}), 'learning').accepted, false, 'A finite balance must still represent the exact support amount');

// Real retention responses and their budget records agree; their histories are separate.
for (const responseId of ['joint-curriculum', 'peer-exchange', 'monitor']) {
  const before = game({grades: [2, 5, 5, 5, 5, 5], special: 0}), ledger = budget.initial(before);
  const response = retention.respond(retention.sync(retention.initial(), before), responseId, before);
  assert.ok(response.accepted);
  const recorded = record(ledger, before, response.game, response.record.id, 'retention');
  assert.equal(recorded.entries[0].amount, -response.record.cost || 0);
  assert.deepEqual(response.game.history, before.history);
}

const invalidFlows = [
  {id: '', year: 2026, kind: 'policy'},
  {id: 'x', year: NaN, kind: 'policy'},
  {id: 'x', year: 2025, kind: 'policy'},
  {id: 'x', year: 2026, kind: 'unknown'},
  {id: 'x', year: 2026, kind: 'support'},
  {id: 'x', year: 2026, kind: 'allocation'}
];
for (const flow of invalidFlows) assert.equal(budget.record(start, flow, startGame, {...startGame, money: 90}).accepted, false);
for (const bad of [NaN, Infinity, -Infinity, '90']) assert.equal(budget.record(start, {id: 'bad-money', year: 2026, kind: 'policy'}, startGame, {...startGame, money: bad}).accepted, false);
assert.equal(budget.record(start, {id: 'mismatch', year: 2026, kind: 'policy'}, {...startGame, money: 99}, {...startGame, money: 90}).accepted, false);
assert.equal(budget.record(start, {id: 'retention-inflow', year: 2026, kind: 'retention'}, startGame, {...startGame, money: 110}).accepted, false);
assert.equal(budget.record(start, {id: 'ended', year: 2026, kind: 'policy'}, {...startGame, done: true}, {...startGame, money: 110}).accepted, false);
assert.equal(budget.support(start, {...startGame, money: 99}, 'learning').accepted, false);
const malformed = copy(state); malformed.entries.push({id: 'invalid', year: 2027, kind: 'policy', amount: NaN, balanceAfter: 0});
assert.deepEqual(budget.normalize(malformed, current), state);
const duplicateRaw = copy(state); duplicateRaw.entries.push(copy(duplicateRaw.entries.at(-1)));
assert.deepEqual(budget.normalize(duplicateRaw, current), state);
const badGrants = {...copy(state), grants: [{year: 1900, purpose: 'unknown'}]};
assert.deepEqual(budget.normalize(badGrants, current), state, 'Grant entitlements derive from recorded support flows');

console.log('PASS budget ledger: actual flows, support purpose/gap/limit, affordability, legacy debt, allocation clamps, retention integration, reload/idempotence and immutability');
