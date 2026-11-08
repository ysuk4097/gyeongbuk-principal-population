'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const model = require('../dist/retention.js');
const organization = require('../dist/organization.js');
const dist = path.resolve(__dirname, '../dist');
const read = name => fs.readFileSync(path.join(dist, name), 'utf8');
const policy = JSON.parse(JSON.stringify(vm.runInNewContext(read('organization-policy.js') + '\nOrganizationPolicy;')));
const sourceIds = vm.runInNewContext(read('retention-evidence.js') + '\nObject.keys(RetentionEvidenceSources);');
const sum = values => values.reduce((a, b) => a + b, 0);
const json = value => JSON.stringify(value);
const total = game => Math.floor(sum(game.grades) + game.special + .5);
const counts = game => organization.assess(game.grades, {special: game.special, year: game.year}, policy);
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze)}
  return value;
}
function game(extra = {}) {
  return {year: 2027, grades: [5, 5, 5, 5, 5, 5], special: 0, money: 100, happy: 74, points: [{year: 2026, total: 30}, {year: 2027, total: 30}], history: [{year: 2027, title: '기존 연간 선택'}], organization: {combinedGroups: [], ending: null}, lifecycle: {ending: null}, done: false, rep: 63, teacher: 65, facilities: 60, appeal: 2, ...extra};
}
function pending(before) {return model.sync(model.initial(), before)}
function verifyOutcome(before, result, expectedLoss) {
  assert.ok(result.accepted);
  const after = result.game, record = result.record, beforeCounts = counts(before), afterCounts = counts(after);
  assert.equal(record.loss, expectedLoss);
  assert.equal(total(before) - total(after), expectedLoss);
  assert.equal(after.special, before.special, 'Raw special/itinerant count must be exact');
  assert.equal(beforeCounts.specialCount, afterCounts.specialCount, 'Displayed special/itinerant count must stay unchanged');
  assert.deepEqual(record.beforeGrades, beforeCounts.grades);
  assert.deepEqual(record.afterGrades, afterCounts.grades);
  assert.ok(afterCounts.grades.every((count, index) => count <= beforeCounts.grades[index]), 'No displayed grade may gain pupils during outflow');
  assert.equal(sum(record.gradeLosses.map(entry => entry.count)), expectedLoss);
  for (const entry of record.gradeLosses) {
    assert.ok(Number.isInteger(entry.grade) && entry.grade >= 1 && entry.grade <= 6 && Number.isInteger(entry.count) && entry.count > 0);
    assert.equal(entry.count, beforeCounts.grades[entry.grade - 1] - afterCounts.grades[entry.grade - 1]);
  }
  assert.ok(after.grades.every(value => Number.isFinite(value) && value >= 0));
  assert.ok(sum(after.grades) <= sum(before.grades) + 1e-9, 'Outflow cannot create aggregate regular pupil mass');
  assert.equal(record.before, total(before));
  assert.equal(record.after, total(after));
  assert.equal(record.specialBefore, before.special);
  assert.equal(record.specialAfter, before.special);
  for (const key of ['points', 'history', 'organization', 'lifecycle', 'rep', 'teacher', 'facilities', 'appeal', 'year', 'done']) assert.deepEqual(after[key], before[key], `${key} is owned by the app or another model`);
  assert.ok(record.sourceIds.every(id => sourceIds.includes(id)));
  assert.deepEqual(model.normalize(JSON.parse(json(result.state))), result.state);
}

assert.deepEqual(model.normalize(undefined), model.initial());
assert.equal(model.assess(game()).eligible, false, 'Ordinary cohorts without a condition have no event');
assert.equal(model.assess(game({grades: [0, 5, 5, 5, 5, 5], points: []})).eligible, false, 'First grade zero is not an independent risk condition');
const combined = game({organization: {combinedGroups: [{grades: [1, 2], total: 4}], ending: null}});
assert.ok(model.assess(combined).reasons.includes('combined-class'));
assert.ok(model.assess(combined).eligible);
assert.equal(model.assess({...combined, happy: 75}).eligible, false);
assert.equal(model.assess({...combined, happy: 75}).suppressed, true);
assert.equal(model.assess({...combined, happy: 74}).eligible, true);
assert.ok(model.assess(game({grades: [2, 5, 5, 5, 5, 5], points: []})).reasons.includes('small-peer-cohort'));
assert.ok(!model.assess(game({grades: [3, 5, 5, 5, 5, 5], points: []})).reasons.includes('small-peer-cohort'));
const declining = game({grades: [8, 8, 8, 8, 8, 0], points: [{year: 2026, total: 50}]});
assert.ok(model.assess(declining).reasons.includes('pronounced-drop'));
assert.equal(model.assess(declining).risk, 2);
assert.ok(!model.assess({...declining, grades: [9, 8, 8, 8, 8, 0]}).reasons.includes('pronounced-drop'));
assert.ok(!model.assess(game({grades: [1, 1, 0, 0, 0, 0], points: [{year: 2026, total: 3}]})).reasons.includes('pronounced-drop'), 'One pupil is below the two-pupil drop threshold');
for (const extra of [{grades: [0, 0, 0, 0, 0, 0], special: 0}, {grades: [0, 0, 0, 0, 0, 0], special: 1}, {organization: {combinedGroups: [{}], ending: {kind: 'closed'}}}, {lifecycle: {ending: {changeId: 'official'}}}, {done: true}]) assert.equal(model.assess(game(extra)).eligible, false);

const start = freeze(pending(combined));
assert.ok(start.pending && start.pending.choices.length === 3);
assert.deepEqual(model.sync(start, combined), start);
assert.deepEqual(start.pending.choices.map(choice => [choice.id, choice.cost, choice.happyChange, choice.loss]), [['joint-curriculum', 12, 6, 0], ['peer-exchange', 6, 3, 0], ['monitor', 0, 0, 1]]);
for (const id of ['joint-curriculum', 'peer-exchange', 'monitor']) {
  const before = freeze(game({...declining})), beforeJson = json(before), state = freeze(pending(before)), stateJson = json(state);
  const choice = state.pending.choices.find(entry => entry.id === id), result = model.respond(state, id, before);
  verifyOutcome(before, result, choice.loss);
  assert.equal(result.game.money, before.money - choice.cost);
  assert.equal(result.game.happy, before.happy + choice.happyChange);
  assert.equal(json(before), beforeJson);
  assert.equal(json(state), stateJson);
  const duplicate = model.respond(result.state, id, result.game);
  assert.equal(duplicate.accepted, false);
  assert.deepEqual(duplicate.state, result.state);
}
const manualMonitor = model.respond(start, 'monitor', combined);
assert.deepEqual(model.respond(JSON.parse(json(start)), 'monitor', combined), manualMonitor, 'The disclosed default monitor uses exactly the same deterministic response');
assert.equal(model.sync(manualMonitor.state, {...combined, year: 2028}).pending, null);
assert.ok(model.sync(manualMonitor.state, {...combined, year: 2029}).pending);
const cancelled = model.sync(start, {...combined, happy: 75});
assert.equal(cancelled.pending, null);
assert.equal(cancelled.history.at(-1).response, 'suppressed');
assert.equal(cancelled.history.at(-1).loss, 0);
assert.deepEqual(model.sync(cancelled, {...combined, happy: 75}), cancelled);
const stale = model.sync(start, {...combined, year: 2028});
assert.equal(stale.pending, null);
assert.equal(stale.history.at(-1).response, 'defer');
assert.equal(stale.history.at(-1).loss, 0, 'Pure sync only expires stale legacy events; the app applies normal advance monitor before sync');
const debt = {...combined, money: -20};
assert.equal(model.assess(debt).choices.find(choice => choice.id === 'monitor').available, true);
assert.equal(model.respond(pending(debt), 'joint-curriculum', debt).accepted, false);
assert.equal(model.respond(pending(debt), 'monitor', debt).accepted, true);
assert.equal(model.respond(start, 'invalid', combined).accepted, false);

for (const extra of [
  {grades: [1, 0, 0, 0, 0, 0], special: 0},
  {grades: [.6, 0, 0, 0, 0, 0], special: 0},
  {grades: [.8, 0, 0, 0, 0, 0], special: 0},
  {grades: [.51, 0, 0, 0, 0, 0], special: .49},
  {grades: [.6, .6, .6, .6, .6, .6], special: .6},
  {grades: [1.2, 2.4, 3.8, 4.6, .3, .2], special: 1.7}
]) {
  const before = freeze(game({...extra, points: [{year: 2026, total: 100}]})), assessment = model.assess(before);
  assert.ok(assessment.eligible);
  for (const choice of assessment.choices) verifyOutcome(before, model.respond(pending(before), choice.id, before), choice.loss);
}
assert.equal(model.assess(game({grades: [.6, 0, 0, 0, 0, 0], special: .6, points: []})).maxLoss, 0, 'Removing regular fractions cannot remove the still-visible special pupil');
assert.equal(model.assess(game({grades: [.6, 0, 0, 0, 0, 0], special: .6, points: []})).eligible, false);

const schools = vm.runInNewContext(read('schools.js') + '\nSCHOOLS;');
const sourceSnapshot = json(schools);
let forecastStates = 0, testedResponses = 0;
const observedLosses = new Set();
for (const school of schools) for (const point of school.forecast) {
  const before = game({year: point.year, grades: Array.from(point.grades), special: point.special, points: [{year: point.year - 1, total: Math.max(point.total + 2, Math.ceil(point.total / .8))}]});
  const beforeJson = json(before), assessment = model.assess(before);
  assert.equal(assessment.total, point.total);
  assert.deepEqual(assessment.grades, counts(before).grades);
  if (assessment.eligible) for (const choice of assessment.choices) {
    const result = model.respond(pending(before), choice.id, before);
    verifyOutcome(before, result, choice.loss);
    observedLosses.add(result.record.loss);
    testedResponses++;
  }
  assert.equal(json(before), beforeJson);
  forecastStates++;
}
assert.equal(forecastStates, 474 * 20);
assert.deepEqual([...observedLosses].sort(), [0, 1, 2]);
assert.equal(json(schools), sourceSnapshot, 'Risk responses do not modify forecasts or regional targets');
const context = vm.createContext({});
vm.runInContext(read('retention.js'), context);
assert.equal(vm.runInContext('typeof RetentionModel.respond', context), 'function');
console.log(JSON.stringify({status: 'passed', forecastStates, testedResponses, lossSizes: [...observedLosses].sort(), happinessShield75: true, cooldownAndReload: true, immutableState: true, specialRawAndDisplayProtected: true, exactHeadlineAndGradeLosses: true, explicitMonitorParity: true}, null, 2));
