'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const model = require('../dist/lifecycle.js');
const school = {code: 'S150002057', name: '모동초등학교', id: '상주-모동초등학교'};
const change = {
  changeId: 'modong-2026-09-01', kind: 'closure', status: 'effective',
  effectiveDate: '2026-09-01', firstZeroForecastYear: 2027,
  schoolCode: school.code, schoolName: school.name, region: '상주',
  recipientCodes: [], recipientNames: [], recipientStatus: 'unknown',
  sourceIds: ['closure-source']
};
const calendar = {checked: '2026-11-08', coverage: 'Synthetic test calendar', sources: {'closure-source': {title: 'Synthetic fixture'}}, changes: [change]};
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze)}
  return value;
}
function game(year = 2026) {
  return {
    version: 3, schoolId: school.id, year,
    grades: [1.4, 2.1, 3.2, 4.1, 0, 0], special: 1.4,
    money: 123, rep: 61, teacher: 67, happy: 68, facilities: 64, appeal: 4,
    organization: {version: 1, combinedGroups: [{grades: [1, 2], total: 3}], handledKeys: ['multigrade:1-2'], pending: null, consultation: {stage: 'consulting', startedYear: 2026, preparedYear: null}, ending: null, log: [{year: 2026, kind: 'support', title: '운영 검토'}]},
    eventId: 'teacher-workload', chosen: true, chosenIndex: 1, last: '기존 연간 선택 기록', done: year >= 2045,
    history: [{year: 2026, title: '협력 수업 지원', eventId: 'teacher-workload', optionIndex: 1}],
    points: Array.from({length: year - 2026 + 1}, (_, index) => ({year: 2026 + index, total: 12 + index})),
    extension: {notes: ['다른 상태는 보존']}
  };
}

assert.equal(model.closureFor(school, 2026, calendar), null, 'September closure keeps the 2026 public snapshot');
assert.deepEqual(model.closureFor(school, 2027, calendar), change);
assert.deepEqual(model.closureFor(school, 2045, calendar), change);
assert.equal(model.closureFor({...school, code: 'OTHER'}, 2027, calendar), null, 'Names and IDs never substitute for exact school code');
assert.equal(model.closureFor({name: school.name}, 2027, calendar), null);
assert.equal(model.closureFor(school, '2027', calendar), null);
for (const status of ['proposed', 'consultation', 'cancelled', undefined]) {
  assert.equal(model.closureFor(school, 2027, {changes: [{...change, status}]}), null);
}
assert.ok(model.closureFor(school, 2027, {changes: [{...change, status: 'approved'}]}));
for (const kind of ['branch', 'rename', 'affiliation']) {
  const fixture = {changes: [{...change, kind}]};
  assert.equal(model.closureFor(school, 2027, fixture), null);
  const before = game();
  const result = model.reconcile(freeze(before), school, 2027, fixture);
  assert.equal(result.changed, false);
  assert.equal(result.record, null);
  assert.deepEqual(result.state, before, `${kind} must never zero a school`);
}
assert.ok(model.closureFor({...school, lifecycleChanges: [change]}, 2027, {changes: []}));
const delayed = {...change, effectiveDate: '2028-09-01', firstZeroForecastYear: 2030};
assert.equal(model.closureFor(school, 2029, {changes: [delayed]}), null, 'The supplied first-zero year is authoritative');
assert.equal(model.closureFor(school, 2030, {changes: [delayed]}).firstZeroForecastYear, 2030);
assert.equal(model.closureFor(school, 2027, {changes: [{...change, firstZeroForecastYear: undefined}]}), null, 'Do not derive the zero year from the effective date');
assert.equal(model.closureFor(school, 2027, {changes: [{...change, effectiveDate: '2026-02-30'}]}), null);

const original = freeze(game());
const originalJson = JSON.stringify(original);
const unchanged = model.reconcile(original, school, 2026, freeze(calendar));
assert.equal(unchanged.changed, false);
assert.deepEqual(unchanged.state, original);
assert.notEqual(unchanged.state, original);
let result = model.reconcile(original, freeze(school), 2027, calendar);
assert.ok(result.changed);
assert.equal(result.record.students, 12, 'Snapshot count uses one rounding over all original students');
assert.equal(result.record.snapshot.total, 12);
assert.equal(result.record.lastEnrollment, result.record.students);
assert.equal(result.record.graduated, 0, 'The September 2026 closure does not assume a later graduating cohort');
assert.equal(result.record.transferred, 12);
assert.equal(result.record.legacyAdjustment, false);
for (const key of ['year', 'grades', 'special', 'points', 'history', 'eventId', 'chosen', 'chosenIndex', 'last']) assert.deepEqual(result.record.snapshot[key], original[key], `Snapshot preserves ${key}`);
assert.deepEqual(result.state.grades, [0, 0, 0, 0, 0, 0]);
assert.equal(result.state.special, 0);
assert.equal(result.state.year, 2027);
assert.equal(result.state.done, false, 'Lifecycle does not reuse the 2045 completion flag');
assert.deepEqual(result.state.points, [{year: 2026, total: 12}, {year: 2027, total: 0}]);
assert.equal(result.record.legacyReconciled, false);
assert.equal(result.record.recordedYear, 2027);
assert.equal(result.record.effectiveDate, '2026-09-01');
assert.deepEqual(result.record.sourceIds, ['closure-source']);
assert.deepEqual(result.record.recipientCodes, []);
assert.deepEqual(result.record.recipientNames, []);
assert.equal(result.record.recipientStatus, 'unknown');
for (const key of ['money', 'rep', 'teacher', 'happy', 'facilities', 'appeal', 'organization', 'eventId', 'chosen', 'chosenIndex', 'last', 'history', 'extension']) assert.deepEqual(result.state[key], original[key], `Closure must not apply annual game effects to ${key}`);
assert.equal(JSON.stringify(original), originalJson);
assert.equal(result.state.organization.ending, null, 'Official closure is separate from organization endings');
assert.equal(result.state.lifecycle.ending, result.record);

const closed = freeze(result.state);
const closedJson = JSON.stringify(closed);
result = model.reconcile(closed, school, 2027, calendar);
assert.equal(result.changed, false);
assert.deepEqual(result.state, closed);
assert.equal(JSON.stringify(closed), closedJson);
assert.deepEqual(result.record.snapshot, closed.lifecycle.ending.snapshot);
const restored = copy(closed);
assert.deepEqual(model.normalize(restored.lifecycle), restored.lifecycle);
assert.deepEqual(model.reconcile(restored, school, 2030, calendar).state, restored, 'An existing ending cannot silently advance or replace its snapshot');
assert.equal(model.reconcile(restored, school, 2030, calendar).changed, false);

const legacy = game(2030);
legacy.points.push({year: 2032, total: 77});
legacy.history.push({year: 2030, title: '이전 판의 진행', eventId: 'housing-discussion', optionIndex: 2});
const legacyJson = JSON.stringify(legacy);
result = model.reconcile(freeze(legacy), school, 2030, calendar);
assert.ok(result.changed && result.record.legacyReconciled);
assert.equal(result.state.year, 2030, 'A legacy save retains its current year');
assert.equal(result.record.snapshot.year, 2030);
assert.equal(result.record.legacyAdjustment, true);
assert.equal(result.record.graduated, null, 'Legacy reconciliation cannot claim actual historical graduations');
assert.equal(result.record.transferred, result.record.lastEnrollment);
assert.equal(result.record.recordedYear, 2030);
assert.deepEqual(result.record.snapshot.points, legacy.points, 'Full counterfactual points are archived, including later entries');
assert.deepEqual(result.record.snapshot.history, legacy.history);
assert.deepEqual(result.state.history, legacy.history, 'Annual history is not rewritten or appended');
assert.deepEqual(result.state.points, [{year: 2026, total: 12}, ...[2027, 2028, 2029, 2030].map(year => ({year, total: 0}))]);
assert.equal(JSON.stringify(legacy), legacyJson);
assert.deepEqual(model.normalize(copy(result.state.lifecycle)), result.state.lifecycle);

const marchClosure = {...change, changeId: 'approved-march-closure', effectiveDate: '2027-03-01', status: 'approved'};
const marchBefore = {...game(), grades: [1.1, 2.1, 3.1, 4.1, 5.1, 6.5], special: 1.4};
const marchResult = model.reconcile(freeze(marchBefore), school, 2027, {changes: [marchClosure]});
assert.equal(marchResult.record.graduated, 7, 'Largest remainder allocates the graduating grade before accounting');
assert.equal(marchResult.record.lastEnrollment, 23);
assert.equal(marchResult.record.transferred, 16);
assert.equal(marchResult.record.lastEnrollment, marchResult.record.graduated + marchResult.record.transferred);
assert.deepEqual(marchResult.record.snapshot.grades, marchBefore.grades);
assert.equal(marchResult.record.snapshot.special, 1.4);
assert.deepEqual(model.normalize(copy(marchResult.state.lifecycle)), marchResult.state.lifecycle);
const tiedMarch = model.reconcile({...game(), grades: [.5, .5, .5, .5, .5, .5], special: .5}, school, 2027, {changes: [marchClosure]});
assert.equal(tiedMarch.record.graduated, 0, 'The same earlier-grade tie break is used for graduation');
assert.equal(tiedMarch.record.lastEnrollment, tiedMarch.record.graduated + tiedMarch.record.transferred);
const sameYearMarch = model.reconcile(game(2027), school, 2028, {changes: [{...marchClosure, firstZeroForecastYear: 2028}]});
assert.equal(sameYearMarch.record.graduated, 0, 'A March date in the snapshot year is not a new-year graduation');
assert.equal(sameYearMarch.record.lastEnrollment, sameYearMarch.record.graduated + sameYearMarch.record.transferred);

for (const values of [{grades: [0, 0, 0, 0, 0, 0], special: 0, expected: 0}, {grades: [0, 0, 0, 0, 0, 0], special: 3.5, expected: 4}, {grades: [.08, .08, .08, .08, .08, .08], special: .03, expected: 1}]) {
  const before = {...game(), grades: values.grades, special: values.special};
  const applied = model.reconcile(freeze(before), school, 2027, calendar);
  assert.equal(applied.record.students, values.expected);
  assert.deepEqual(applied.record.snapshot.grades, values.grades);
  assert.equal(applied.record.snapshot.special, values.special);
  assert.deepEqual(model.normalize(copy(applied.state.lifecycle)), applied.state.lifecycle);
}
const completed = game(2045);
result = model.reconcile(completed, school, 2045, calendar);
assert.equal(result.state.done, true);
assert.equal(result.state.year, 2045);
assert.equal(result.state.points.at(-1).total, 0);
const proposedRecipient = {...change, recipientCodes: ['DEST'], recipientNames: ['공식안의 수용교'], recipientStatus: 'proposed'};
result = model.reconcile(game(), school, 2027, {changes: [proposedRecipient]});
assert.ok(result.changed);
assert.equal(result.record.recipientStatus, 'proposed', 'Closure approval never upgrades a proposed recipient');
assert.deepEqual(result.record.recipientCodes, ['DEST']);
assert.deepEqual(result.record.recipientNames, ['공식안의 수용교']);
assert.equal(model.normalize(result.state.lifecycle).ending.recipientStatus, 'proposed');
assert.deepEqual(model.normalize(undefined), {version: 1, ending: null});
assert.deepEqual(model.normalize({version: 2, ending: result.record}), {version: 1, ending: null});
assert.deepEqual(model.normalize({version: 1, ending: {...result.record, students: -1}}), {version: 1, ending: null});
assert.deepEqual(model.normalize({version: 1, ending: {...result.record, snapshot: {...result.record.snapshot, total: 999}}}), {version: 1, ending: null});

const script = fs.readFileSync(path.resolve(__dirname, '../dist/lifecycle.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext('const DEMOGRAPHICS=' + JSON.stringify({schoolCalendar: calendar}) + ';\n' + script, context);
assert.equal(vm.runInContext('LifecycleModel.closureFor(' + JSON.stringify(school) + ',2027).changeId', context), change.changeId);

// Validate the actual source calendar against the observed roster, not name guesses.
const actual = vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../dist/schools.js'), 'utf8') + '\n({schools:SCHOOLS,calendar:DEMOGRAPHICS.schoolCalendar});');
assert.equal(actual.schools.length, 474);
assert.ok(actual.calendar && Array.isArray(actual.calendar.changes) && actual.calendar.changes.length);
const actualSnapshot = JSON.stringify(actual);
const schoolByCode = new Map(actual.schools.map(entry => [entry.code, entry]));
const actualClosures = actual.calendar.changes.filter(entry => entry.kind === 'closure');
const actualNonClosures = actual.calendar.changes.filter(entry => entry.kind !== 'closure');
assert.ok(actualClosures.length && actualNonClosures.length);
for (const entry of actual.calendar.changes) {
  const sourceSchool = schoolByCode.get(entry.schoolCode);
  assert.ok(sourceSchool, `${entry.changeId}: unknown exact school code`);
  assert.equal(entry.schoolName, sourceSchool.name, `${entry.changeId}: observed school name must match its exact code`);
  assert.equal(entry.region, sourceSchool.region, `${entry.changeId}: calendar region must match the observed roster`);
  assert.ok(entry.sourceIds.length && entry.sourceIds.every(id => actual.calendar.sources[id]), `${entry.changeId}: sources must exist`);
  if (entry.kind === 'closure') {
    const publicPoint = sourceSchool.forecast.find(point => point.year === 2026);
    const zeroPoint = sourceSchool.forecast.find(point => point.year === entry.firstZeroForecastYear);
    assert.equal(publicPoint.total, sourceSchool.base, `${entry.changeId}: preserve 2026 public snapshot`);
    assert.equal(zeroPoint.total, 0, `${entry.changeId}: the first forecast closure year must be zero`);
    assert.equal(model.closureFor(sourceSchool, 2026, actual.calendar), null);
    const baselineGame = {...game(), schoolId: sourceSchool.id, grades: Array.from(sourceSchool.grades), special: sourceSchool.special, points: [{year: 2026, total: sourceSchool.base}]};
    assert.deepEqual(model.reconcile(baselineGame, sourceSchool, 2026, actual.calendar).state, baselineGame);
    const applied = model.reconcile(freeze(baselineGame), sourceSchool, entry.firstZeroForecastYear, actual.calendar);
    assert.ok(applied.changed);
    assert.equal(applied.record.changeId, entry.changeId);
    assert.equal(applied.record.students, sourceSchool.base);
    assert.equal(applied.record.lastEnrollment, applied.record.graduated + applied.record.transferred);
    assert.equal(applied.record.recipientStatus, entry.recipientStatus);
    assert.deepEqual(applied.record.recipientCodes, Array.from(entry.recipientCodes));
    assert.deepEqual(applied.record.recipientNames, Array.from(entry.recipientNames));
    assert.equal(applied.record.legacyAdjustment, false);
    assert.equal(applied.state.year, entry.firstZeroForecastYear);
    assert.ok(applied.state.grades.every(value => value === 0) && applied.state.special === 0);
  } else {
    const isolatedSchool = {...sourceSchool, lifecycleChanges: [entry]};
    const isolatedCalendar = {...actual.calendar, changes: [entry]};
    const baselineGame = {...game(), schoolId: sourceSchool.id, grades: Array.from(sourceSchool.grades), special: sourceSchool.special};
    const unchanged = model.reconcile(freeze(baselineGame), isolatedSchool, 2027, isolatedCalendar);
    assert.equal(unchanged.changed, false, `${entry.changeId}: ${entry.kind} cannot zero enrollment`);
    assert.deepEqual(unchanged.state, baselineGame);
  }
}
assert.equal(JSON.stringify(actual), actualSnapshot, 'Source calendar and roster stay unchanged');
console.log(JSON.stringify({status: 'passed', exactCodeAndStatus: true, suppliedYearGate: true, preserved2026Snapshot: true, nonClosureChangesIgnored: true, immutableSnapshots: true, legacyZeroGraph: true, unchangedMetricsAndHistory: true, jsonIdempotence: true, recipientStatusPreserved: true, graduationTransferConservation: true, legacyGraduationUnknown: true, actualSourceChanges: actual.calendar.changes.length, actualClosures: actualClosures.length, actualNonClosures: actualNonClosures.length}, null, 2));
