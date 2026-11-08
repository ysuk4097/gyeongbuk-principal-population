'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const model = require('../dist/organization.js');
const dist = path.resolve(__dirname, '../dist');
const read = name => fs.readFileSync(path.join(dist, name), 'utf8');
const policy = JSON.parse(JSON.stringify(vm.runInNewContext(read('organization-policy.js') + '\nOrganizationPolicy;')));
const assess = (grades, context = {}) => model.assess(grades, context, policy);
const json = value => JSON.stringify(value);
const groups = assessment => assessment.suggestedGroups.map(group => group.grades);
const candidate = (assessment, first, second) => assessment.pairCandidates.some(group => json(group.grades) === json([first, second]));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

assert.equal(policy.referenceYear, 2026);
assert.equal(policy.multigrade.perGradeMax, 3);
assert.equal(policy.multigrade.pairTotalMax, 5);
assert.ok(candidate(assess([3, 2, 10, 10, 10, 10]), 1, 2));
assert.ok(!candidate(assess([3, 3, 10, 10, 10, 10]), 1, 2));
assert.ok(!candidate(assess([0, 1, 10, 10, 10, 10]), 1, 2));
assert.ok(candidate(assess([2, 10, 10, 3, 10, 10]), 1, 4));
assert.ok(candidate(assess([2, 10, 10, 10, 10, 3]), 1, 6));
assert.ok(candidate(assess([10, 10, 3, 10, 10, 2]), 3, 6));
const allPairs = assess([1, 1, 1, 1, 1, 1]);
assert.equal(allPairs.pairCandidates.length, 15);
assert.deepEqual(groups(allPairs), [[1, 2], [3, 4], [5, 6]], 'Matching uses the lexicographically first maximum pairing');
const nonGreedy = assess([2, 2, 3, 3, 10, 10]);
assert.deepEqual(groups(nonGreedy), [[1, 3], [2, 4]], 'A greedy first pair would miss a second eligible pair');
assert.deepEqual(groups(nonGreedy), groups(assess([2, 2, 3, 3, 10, 10])));
for (const assessment of [allPairs, nonGreedy]) {
  const grades = groups(assessment).flat();
  assert.equal(new Set(grades).size, grades.length);
}

assert.deepEqual(assess([.5, .5, .5, .5, .5, .5]).grades, [1, 1, 1, 0, 0, 0], 'Equal remainders favor earlier grades');
assert.deepEqual(assess([1.2, 2.8, 3.1, 4.9, 5, 6]).grades, [1, 3, 3, 5, 5, 6]);
assert.equal(assess([.08, .08, .08, .08, .08, .08], {special: .03}).specialCount, 1, 'Special is the exact headline residual');
assert.equal(assess([.49, .49, 0, 0, 0, 0], {special: .49}).specialCount, 0);
const malformed = assess([NaN, -2, Infinity, '3', null, 1.6], {special: -10});
assert.deepEqual(malformed.grades, [0, 0, 0, 0, 0, 2]);
assert.equal(malformed.total, 2);
assert.deepEqual(assess(null).grades, [0, 0, 0, 0, 0, 0]);

assert.deepEqual(assess([22, 1, 1, 1, 1, 1], {locality: 'dong'}).capacity, {mode: 'exact', lower: 25, upper: 25});
assert.deepEqual(assess([22, 1, 1, 1, 1, 1], {locality: 'eupMyeon'}).capacity, {mode: 'exact', lower: 21, upper: 21});
assert.deepEqual(assess([22, 1, 1, 1, 1, 1], {school: {address: '경상북도 구미시'}}).capacity, {mode: 'range', lower: 21, upper: 25});
assert.equal(assess([21, 1, 1, 1, 1, 1]).capacityReview, false);
assert.equal(assess([22, 1, 1, 1, 1, 1]).capacityReview, true);
assert.equal(assess([25, 1, 1, 1, 1, 1], {locality: 'dong'}).capacityReview, false);
assert.equal(assess([26, 1, 1, 1, 1, 1], {locality: 'dong'}).capacityReview, true);
for (const name of policy.capacity.specialSchoolNames) {
  assert.deepEqual(assess([20, 1, 1, 1, 1, 1], {school: {name}}).capacity, {mode: 'exact', lower: 20, upper: 20});
  assert.equal(assess([21, 1, 1, 1, 1, 1], {school: name}).capacityReview, true);
}
assert.deepEqual(assess([20, 1, 1, 1, 1, 1], {school: {name: '월성초등학교분교'}}).capacity, {mode: 'range', lower: 21, upper: 25});
assert.equal(assess([166, 166, 166, 167, 167, 167], {locality: 'eupMyeon'}).total, 999);
assert.equal(assess([166, 166, 166, 167, 167, 167], {locality: 'eupMyeon'}).capacity.mode, 'exact');
assert.deepEqual(assess([166, 166, 167, 167, 167, 167], {locality: 'eupMyeon'}).capacity, {mode: 'range', lower: 21, upper: 25});
assert.equal(assess([166, 166, 166, 167, 167, 167], {special: 1, locality: 'eupMyeon'}).capacity.mode, 'range');
assert.equal(assess([166, 166, 167, 167, 167, 167], {locality: 'dong'}).capacity.mode, 'exact');
assert.equal(assess([1, 1, 1, 1, 1, 1], {year: 2045}).referenceYear, 2026);

const zero = assess([0, 0, 0, 0, 0, 0]);
assert.ok(zero.zeroEnrollment && !zero.noIncoming);
assert.deepEqual(zero.emptyGrades, [1, 2, 3, 4, 5, 6]);
const noIncoming = assess([0, 5, 5, 5, 5, 5]);
assert.ok(noIncoming.noIncoming && !noIncoming.zeroEnrollment);
assert.equal(assess([0, 0, 0, 0, 0, 0], {special: 1}).noIncoming, true);
assert.deepEqual(model.normalize(undefined), model.initial());
assert.deepEqual(model.normalize({grades: [1, 2, 3]}), model.initial());
assert.deepEqual(model.normalize({version: 99, ending: {kind: 'closed', year: 2026, students: 0}}), model.initial());
const invalid = model.normalize({version: 1, combinedGroups: [{grades: [0, 2], total: 3}, {grades: [1, 2], total: 3}, {grades: [2, 3], total: 4}], handledKeys: ['wrong', 'multigrade:1-2', 'multigrade:1-2'], pending: {key: 'wrong', kind: 'wrong', year: 2026}, consultation: {stage: 'ready', startedYear: 2027, preparedYear: 2026}, log: [null, {year: 2026, kind: 'support', title: '지원 검토'}]});
assert.deepEqual(invalid.combinedGroups, [{grades: [1, 2], total: 3}]);
assert.deepEqual(invalid.handledKeys, ['multigrade:1-2']);
assert.equal(invalid.pending, null);
assert.equal(invalid.consultation.stage, 'consulting');
assert.equal(invalid.log.length, 1);

let state = model.sync(freeze(model.initial()), freeze(zero), 2026);
assert.equal(state.pending.kind, 'zero-enrollment');
assert.equal(state.ending, null, 'Even zero enrollment never automatically closes a school');
assert.deepEqual(model.sync(freeze(state), zero, 2027), state, 'Stable condition is independent of year');
let action = model.act(freeze(state), 'support', zero, 2026);
assert.ok(action.accepted);
const handled = action.state;
assert.deepEqual(model.sync(handled, zero, 2027), handled, 'Acknowledging the highest condition does not expose another pending copy');
assert.equal(model.act(handled, 'support', zero, 2026).accepted, false);
assert.deepEqual(model.act(handled, 'support', zero, 2026).state, handled);
assert.deepEqual(model.normalize(JSON.parse(json(handled))), handled);
assert.equal(model.sync(model.initial(), noIncoming, 2026).pending.kind, 'no-incoming');
assert.match(model.sync(model.initial(), noIncoming, 2026).log[0].title, /모형상 일반학급 1학년/);
assert.equal(model.sync(model.initial(), assess([5, 0, 5, 5, 5, 5]), 2026).pending.kind, 'empty-grades');
assert.equal(model.sync(model.initial(), allPairs, 2026).pending.kind, 'multigrade');
assert.equal(model.sync(model.initial(), assess([30, 30, 30, 30, 30, 30]), 2026).pending.kind, 'capacity');
state = model.sync(model.initial(), zero, 2026);
state = model.sync(state, assess([30, 30, 30, 30, 30, 30]), 2027);
state = model.sync(state, zero, 2028);
assert.equal(state.log.filter(entry => entry.kind === 'review:zero-enrollment').length, 1, 'A recurring unhandled condition is logged only once');

const pairing = assess([1, 2, 3, 10, 10, 10]);
state = model.sync(model.initial(), pairing, 2026);
action = model.act(freeze(state), 'apply-combined', freeze(pairing), 2026);
assert.ok(action.accepted);
assert.deepEqual(action.state.combinedGroups, pairing.suggestedGroups);
assert.equal(model.act(action.state, 'apply-combined', pairing, 2026).accepted, false);
const changedCounts = assess([2, 2, 3, 11, 11, 11]);
state = model.sync(action.state, changedCounts, 2027);
assert.equal(state.pending, null, 'Counts and fractions do not form a new key for the same candidate pairs');
assert.equal(state.combinedGroups[0].total, 4, 'Reconciliation refreshes the selected pair total');
state = model.sync(state, assess([4, 4, 4, 11, 11, 11]), 2028);
assert.equal(state.combinedGroups.length, 0, 'A pair that no longer meets the threshold is removed');
assert.equal(model.act(state, 'apply-combined', assess([4, 4, 4, 11, 11, 11]), 2028).accepted, false);
const applied = model.act(model.initial(), 'apply-combined', allPairs, 2026).state;
assert.ok(model.act(applied, 'keep-separate', allPairs, 2026).accepted);
assert.equal(model.act(model.initial(), 'keep-separate', allPairs, 2026).accepted, false);

for (const endAction of ['merge', 'close']) {
  const assessment = freeze(assess([2.4, 2.4, 3, 10, 10, 10], {special: 1.3}));
  const assessmentSnapshot = json(assessment);
  state = model.sync(model.initial(), assessment, 2026);
  assert.equal(model.act(state, endAction, assessment, 2026).accepted, false);
  action = model.act(freeze(state), 'start-consultation', assessment, 2026);
  assert.ok(action.accepted);
  state = action.state;
  assert.equal(model.act(state, 'start-consultation', assessment, 2026).accepted, false);
  assert.equal(model.act(state, 'prepare-support', assessment, 2026).accepted, false);
  assert.equal(model.act(state, endAction, assessment, 2027).accepted, false);
  state = model.act(freeze(state), 'prepare-support', assessment, 2027).state;
  assert.equal(state.consultation.stage, 'ready');
  assert.equal(model.act(state, 'prepare-support', assessment, 2027).accepted, false);
  assert.equal(model.act(state, endAction, assessment, 2027).accepted, false);
  assert.equal(model.sync(state, zero, 2045).ending, null, 'A later zero count is still not consent to an ending');
  const finished = model.act(freeze(state), endAction, assessment, 2028);
  assert.ok(finished.accepted);
  assert.deepEqual(finished.state.ending, {kind: endAction === 'merge' ? 'merged' : 'closed', year: 2028, students: assessment.total});
  assert.equal(model.act(finished.state, endAction, assessment, 2028).accepted, false);
  assert.deepEqual(model.sync(finished.state, zero, 2029), finished.state);
  assert.equal(json(assessment), assessmentSnapshot, 'Explicit ending preserves every assessed student count');
  assert.ok(finished.state.log.every(entry => entry.sourceIds.every(id => policy.sources[id])));
}
state = model.act(applied, 'start-consultation', allPairs, 2026).state;
state = model.act(state, 'continue-operation', allPairs, 2026).state;
assert.equal(state.consultation.stage, 'none');
assert.deepEqual(state.combinedGroups, applied.combinedGroups);
assert.equal(model.act(state, 'continue-operation', allPairs, 2026).accepted, false);
assert.equal(model.act(state, 'unknown-action', allPairs, 2026).accepted, false);

const schools = vm.runInNewContext(read('schools.js') + '\nSCHOOLS;');
assert.equal(schools.length, 474);
const snapshot = json(schools);
let forecasts = 0;
for (const school of schools) for (const point of school.forecast) {
  const rawGrades = Array.from(point.grades);
  const assessment = assess(freeze(rawGrades), {special: point.special, year: point.year, school});
  const expectedRegular = Math.floor(rawGrades.reduce((a, b) => a + b, 0) + .5);
  assert.equal(assessment.regularTotal, expectedRegular);
  assert.equal(assessment.total, point.total, `${school.id}/${point.year}: exact headline total`);
  assert.equal(assessment.grades.reduce((a, b) => a + b, 0) + assessment.specialCount, point.total);
  assert.ok(assessment.grades.every(Number.isInteger));
  assert.ok(assessment.grades.every(value => value >= 0));
  assert.ok(Number.isInteger(assessment.specialCount) && assessment.specialCount >= 0);
  const used = assessment.suggestedGroups.flatMap(group => group.grades);
  assert.equal(new Set(used).size, used.length);
  assert.ok(assessment.suggestedGroups.every(group => group.total <= 5 && group.grades.every(grade => assessment.grades[grade - 1] > 0 && assessment.grades[grade - 1] <= 3)));
  forecasts++;
}
assert.equal(forecasts, 474 * 20);
assert.equal(json(schools), snapshot, 'Organization assessment never modifies source forecasts');
const globalContext = vm.createContext({});
vm.runInContext(read('organization-policy.js') + '\n' + read('organization.js'), globalContext);
assert.equal(vm.runInContext('OrganizationModel.assess([1,2,10,10,10,10]).pairCandidates.length', globalContext), 1);
console.log(JSON.stringify({status: 'passed', forecasts, schools: schools.length, referenceYear: policy.referenceYear, nonAdjacentPairs: true, maximumMatching: true, exactHeadlineTotals: true, immutableState: true, stableReviewKeys: true, consultationYearGates: true, explicitEndingsOnly: true}, null, 2));
