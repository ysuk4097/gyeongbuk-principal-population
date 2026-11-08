'use strict';

// An approved school calendar ends a location's simulation without erasing prior play.
const LifecycleModel = (() => {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validYear = value => Number.isInteger(value) && value >= 1 && value <= 9999;
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const list = values => Array.isArray(values) ? [...new Set(values.filter(text))] : [];
  const total = (grades, special) => Math.floor(grades.reduce((sum, value) => sum + value, 0) + special + .5);

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
    return value;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validGrades(grades) {
    return Array.isArray(grades) && grades.length === 6 && grades.every(count);
  }

  function accounting(snapshot, effectiveDate, legacy) {
    const lastEnrollment = snapshot.total;
    if (legacy) return {lastEnrollment, graduated: null, transferred: lastEnrollment, legacyAdjustment: true};
    const grades = snapshot.grades.map(Math.floor);
    const remainder = Math.floor(snapshot.grades.reduce((sum, value) => sum + value, 0) + .5) - grades.reduce((sum, value) => sum + value, 0);
    const ranked = snapshot.grades.map((value, index) => ({index, fraction: value - grades[index]}))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let index = 0; index < remainder; index++) grades[ranked[index].index]++;
    const [effectiveYear, month] = effectiveDate.split('-').map(Number);
    const graduated = effectiveYear > snapshot.year && month <= 3 ? grades[5] : 0;
    // Special/itinerant students have no known grade distribution, so remain in support.
    return {lastEnrollment, graduated, transferred: lastEnrollment - graduated, legacyAdjustment: false};
  }

  function closureFor(school, year, calendar) {
    if (!object(school) || !text(school.code) || !validYear(year)) return null;
    const reference = calendar || (typeof DEMOGRAPHICS !== 'undefined' ? DEMOGRAPHICS.schoolCalendar : null);
    const changes = [...(Array.isArray(school.lifecycleChanges) ? school.lifecycleChanges : []), ...(Array.isArray(reference?.changes) ? reference.changes : [])];
    const applicable = changes.filter(change => object(change) && change.schoolCode === school.code && change.kind === 'closure' && ['approved', 'effective'].includes(change.status) && text(change.changeId) && validDate(change.effectiveDate) && validYear(change.firstZeroForecastYear) && year >= change.firstZeroForecastYear);
    applicable.sort((a, b) => a.firstZeroForecastYear - b.firstZeroForecastYear || a.effectiveDate.localeCompare(b.effectiveDate) || a.changeId.localeCompare(b.changeId));
    return applicable.length ? clone(applicable[0]) : null;
  }

  function normalize(raw) {
    const safe = {version: 1, ending: null};
    if (!object(raw) || raw.version !== 1 || !object(raw.ending)) return safe;
    const record = raw.ending;
    const snapshot = record.snapshot;
    if (!text(record.changeId) || !text(record.schoolCode) || !validDate(record.effectiveDate) || !validYear(record.firstZeroForecastYear) || !validYear(record.recordedYear) || record.recordedYear < record.firstZeroForecastYear || !Number.isInteger(record.students) || record.students < 0) return safe;
    if (!object(snapshot) || !validYear(snapshot.year) || !validGrades(snapshot.grades) || !count(snapshot.special) || !Number.isInteger(snapshot.total) || snapshot.total !== total(snapshot.grades, snapshot.special) || snapshot.total !== record.students || !Array.isArray(snapshot.points) || !Array.isArray(snapshot.history)) return safe;
    safe.ending = {
      changeId: record.changeId,
      effectiveDate: record.effectiveDate,
      firstZeroForecastYear: record.firstZeroForecastYear,
      schoolCode: record.schoolCode,
      sourceIds: list(record.sourceIds),
      recipientCodes: list(record.recipientCodes),
      recipientNames: list(record.recipientNames),
      recipientStatus: ['verified', 'unknown', 'proposed'].includes(record.recipientStatus) ? record.recipientStatus : 'unknown',
      recordedYear: record.recordedYear,
      legacyReconciled: snapshot.year >= record.firstZeroForecastYear,
      students: record.students,
      snapshot: {
        year: snapshot.year,
        grades: clone(snapshot.grades),
        special: snapshot.special,
        total: snapshot.total,
        points: clone(snapshot.points),
        history: clone(snapshot.history),
        eventId: clone(snapshot.eventId ?? null),
        chosen: clone(snapshot.chosen ?? null),
        chosenIndex: clone(snapshot.chosenIndex ?? null),
        last: clone(snapshot.last ?? null)
      }
    };
    Object.assign(safe.ending, accounting(safe.ending.snapshot, safe.ending.effectiveDate, safe.ending.legacyReconciled));
    return safe;
  }

  function reconcile(game, school, targetYear, calendar) {
    const state = clone(game);
    if (!object(game) || !object(school) || !validYear(targetYear)) return {state, changed: false, record: null};
    const existing = normalize(game.lifecycle).ending;
    if (existing && existing.schoolCode === school.code) return {state, changed: false, record: existing};
    const change = closureFor(school, targetYear, calendar);
    if (!change || !validYear(game.year) || !validGrades(game.grades) || !count(game.special)) return {state, changed: false, record: null};
    const recordedYear = Math.max(game.year, targetYear);
    const students = total(game.grades, game.special);
    const record = {
      changeId: change.changeId,
      effectiveDate: change.effectiveDate,
      firstZeroForecastYear: change.firstZeroForecastYear,
      schoolCode: change.schoolCode,
      sourceIds: list(change.sourceIds),
      recipientCodes: list(change.recipientCodes),
      recipientNames: list(change.recipientNames),
      recipientStatus: ['verified', 'unknown', 'proposed'].includes(change.recipientStatus) ? change.recipientStatus : 'unknown',
      recordedYear,
      legacyReconciled: game.year >= change.firstZeroForecastYear,
      students,
      snapshot: {
        year: game.year,
        grades: clone(game.grades),
        special: game.special,
        total: students,
        points: clone(Array.isArray(game.points) ? game.points : []),
        history: clone(Array.isArray(game.history) ? game.history : []),
        eventId: clone(game.eventId ?? null),
        chosen: clone(game.chosen ?? null),
        chosenIndex: clone(game.chosenIndex ?? null),
        last: clone(game.last ?? null)
      }
    };
    Object.assign(record, accounting(record.snapshot, record.effectiveDate, record.legacyReconciled));
    state.grades = [0, 0, 0, 0, 0, 0];
    state.special = 0;
    state.year = recordedYear;
    state.lifecycle = {version: 1, ending: record};
    // Keep pre-closure observations; counterfactual later progress remains in snapshot.
    state.points = record.snapshot.points.filter(point => object(point) && validYear(point.year) && point.year < change.firstZeroForecastYear).map(clone);
    for (let year = change.firstZeroForecastYear; year <= recordedYear; year++) state.points.push({year, total: 0});
    return {state, changed: true, record};
  }

  return {closureFor, normalize, reconcile};
})();
if (typeof module !== 'undefined') module.exports = LifecycleModel;
