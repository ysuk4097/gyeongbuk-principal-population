'use strict';

// Thresholds, costs and pupil losses below are game assumptions, not measured effects.
const RetentionModel = (() => {
  const SOURCE_IDS = ['peer-absence-okdong-2024', 'multigrade-borbely-2023'];
  const REASONS = ['combined-class', 'pronounced-drop', 'small-peer-cohort'];
  const RESPONSES = [
    {id: 'joint-curriculum', label: '이웃 학교 공동수업 지원', cost: 12, happyChange: 6},
    {id: 'peer-exchange', label: '또래 교류 활동 지원', cost: 6, happyChange: 3},
    {id: 'monitor', label: '추가 지원 없이 경과 관찰', cost: 0, happyChange: 0}
  ];
  const validYear = value => Number.isInteger(value) && value > 0 && value <= 9999;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const sum = values => values.reduce((total, value) => total + value, 0);
  const total = (grades, special) => Math.floor(sum(grades) + special + .5);
  const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
  const reasons = values => Array.isArray(values) ? REASONS.filter(reason => values.includes(reason)) : [];
  const sources = values => Array.isArray(values) ? SOURCE_IDS.filter(id => values.includes(id)) : [];
  const validGrades = values => Array.isArray(values) && values.length === 6 && values.every(value => finite(value) && value >= 0);
  const integerGrades = values => {
    const grades = values.map(Math.floor);
    const remainder = Math.floor(sum(values) + .5) - sum(grades);
    const order = values.map((value, index) => ({index, fraction: value - grades[index]})).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let index = 0; index < remainder; index++) grades[order[index].index]++;
    return grades;
  };

  function allocateLoss(values, special, loss) {
    const beforeGrades = integerGrades(values), before = total(values, special);
    const desired = beforeGrades.slice();
    let remaining = loss;
    const order = desired.map((count, index) => ({count, index})).filter(item => item.count > 0).sort((a, b) => a.count - b.count || a.index - b.index);
    for (const {index} of order) {
      const removed = Math.min(desired[index], remaining);
      desired[index] -= removed;
      remaining -= removed;
    }
    let grades = values.slice();
    if (loss > 0) {
      const rawSum = sum(values), targetSum = Math.max(0, rawSum - loss), targetRegular = sum(desired);
      grades = rawSum < loss ? [0, 0, 0, 0, 0, 0] : targetRegular > 0 ? desired.map(count => count / targetRegular * targetSum) : values.map(() => 0);
      const anchor = desired.findIndex(count => count > 0) >= 0 ? desired.findIndex(count => count > 0) : Math.max(0, values.findIndex(value => value > 0));
      if (targetRegular === 0 && rawSum >= loss) grades[anchor] = targetSum;
      const valid = candidate => candidate.every(value => finite(value) && value >= 0) && total(candidate, special) === before - loss && integerGrades(candidate).every((count, index) => count === desired[index]);
      if (!valid(grades)) {
        // A single fractional residue also recovers the desired integer allocation.
        grades = desired.slice();
        grades[anchor] += targetSum - targetRegular;
        if (!valid(grades)) {
          const original = grades.slice();
          const epsilon = Number.EPSILON * Math.max(1, rawSum) * 8;
          for (const delta of [epsilon, -epsilon]) {
            const candidate = original.slice();
            candidate[anchor] += delta;
            if (valid(candidate)) {grades = candidate; break}
          }
        }
      }
      if (!valid(grades)) throw new RangeError('Cannot preserve the rounded pupil allocation');
    }
    const afterGrades = integerGrades(grades), after = total(grades, special);
    const gradeLosses = beforeGrades.flatMap((count, index) => count > afterGrades[index] ? [{grade: index + 1, count: count - afterGrades[index]}] : []);
    return {grades, before, after, loss, beforeGrades, afterGrades, gradeLosses};
  }

  function assess(game) {
    const valid = game && validYear(game.year) && validGrades(game.grades) && finite(game.special) && game.special >= 0 && finite(game.happy) && game.happy >= 0 && game.happy <= 100 && finite(game.money);
    const values = validGrades(game?.grades) ? Array.from(game.grades) : [0, 0, 0, 0, 0, 0];
    const special = finite(game?.special) && game.special >= 0 ? game.special : 0;
    const grades = integerGrades(values), regularTotal = sum(grades), headline = total(values, special);
    let previousTotal = null;
    if (Array.isArray(game?.points)) for (let index = game.points.length - 1; index >= 0; index--) {
      const point = game.points[index];
      if (point?.year === game.year - 1 && Number.isInteger(point.total) && point.total >= 0) {previousTotal = point.total; break}
    }
    const selectedReasons = [];
    if (Array.isArray(game?.organization?.combinedGroups) && game.organization.combinedGroups.length) selectedReasons.push('combined-class');
    if (previousTotal > 0 && previousTotal - headline >= 2 && (previousTotal - headline) * 5 >= previousTotal) selectedReasons.push('pronounced-drop');
    if (grades.some(count => count >= 1 && count <= 2)) selectedReasons.push('small-peer-cohort');
    const suppressed = finite(game?.happy) && game.happy >= 75;
    const maxLoss = Math.max(0, Math.min(regularTotal, headline - Math.floor(special + .5)));
    const risk = Math.min(maxLoss, selectedReasons.includes('pronounced-drop') ? 2 : 1);
    const ended = !!(game?.done || game?.lifecycle?.ending || game?.organization?.ending);
    const eligible = !!valid && !ended && !suppressed && headline > 0 && risk > 0 && selectedReasons.length > 0;
    const choices = RESPONSES.map(response => {
      const loss = response.id === 'joint-curriculum' ? 0 : response.id === 'peer-exchange' ? Math.floor(risk / 2) : risk;
      const outcome = allocateLoss(values, special, loss);
      return {...response, loss, before: headline, after: outcome.after, beforeGrades: outcome.beforeGrades, afterGrades: outcome.afterGrades, gradeLosses: outcome.gradeLosses, available: response.cost === 0 || finite(game?.money) && game.money >= response.cost};
    });
    return {year: validYear(game?.year) ? game.year : null, total: headline, regularTotal, specialCount: headline - regularTotal, grades, previousTotal, reasons: selectedReasons, suppressed, eligible, maxLoss, risk, choices, sourceIds: SOURCE_IDS.slice()};
  }

  function initial() {return {version: 1, lastEventYear: null, pending: null, history: []}}

  function normalize(raw) {
    const state = initial();
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return state;
    if (validYear(raw.lastEventYear)) state.lastEventYear = raw.lastEventYear;
    if (Array.isArray(raw.history)) for (const record of raw.history) {
      if (!record || !validYear(record.year) || record.id !== 'retention-' + record.year || !Number.isInteger(record.before) || !Number.isInteger(record.after) || record.before < record.after || record.after < 0 || record.loss !== record.before - record.after || !validGrades(record.beforeGrades) || !validGrades(record.afterGrades) || state.history.some(entry => entry.id === record.id)) continue;
      state.history.push({...clone(record), reasons: reasons(record.reasons), sourceIds: sources(record.sourceIds)});
      state.lastEventYear = Math.max(state.lastEventYear || 0, record.year);
    }
    const pending = raw.pending;
    if (pending && validYear(pending.year) && pending.id === 'retention-' + pending.year && Number.isInteger(pending.before) && pending.before > 0 && Number.isInteger(pending.risk) && pending.risk > 0 && validGrades(pending.beforeGrades) && finite(pending.specialBefore) && pending.specialBefore >= 0 && !state.history.some(record => record.id === pending.id)) {
      state.pending = {...clone(pending), reasons: reasons(pending.reasons), sourceIds: sources(pending.sourceIds), choices: Array.isArray(pending.choices) ? clone(pending.choices) : []};
      state.lastEventYear = Math.max(state.lastEventYear || 0, pending.year);
    }
    return state;
  }

  function pendingFor(assessment, game) {
    return {id: 'retention-' + assessment.year, year: assessment.year, reasons: assessment.reasons.slice(), before: assessment.total, beforeGrades: assessment.grades.slice(), specialBefore: game.special, risk: assessment.risk, choices: clone(assessment.choices), sourceIds: assessment.sourceIds.slice()};
  }

  function noLossRecord(pending, response) {
    return {id: pending.id, year: pending.year, reasons: pending.reasons.slice(), before: pending.before, after: pending.before, loss: 0, response, sourceIds: pending.sourceIds.slice(), beforeGrades: pending.beforeGrades.slice(), afterGrades: pending.beforeGrades.slice(), gradeLosses: [], specialBefore: pending.specialBefore, specialAfter: pending.specialBefore, cost: 0, happyChange: 0};
  }

  function sync(retention, game) {
    const state = normalize(retention), assessment = assess(game);
    if (state.pending) {
      if (state.pending.year !== assessment.year || !assessment.eligible) {
        const response = state.pending.year !== assessment.year ? 'defer' : assessment.suppressed && !game?.lifecycle?.ending && !game?.organization?.ending && !game?.done ? 'suppressed' : 'cancelled';
        state.history.push(noLossRecord(state.pending, response));
        state.pending = null;
      } else state.pending = pendingFor(assessment, game);
    }
    if (!state.pending && assessment.eligible && (state.lastEventYear === null || assessment.year >= state.lastEventYear + 2)) {
      state.pending = pendingFor(assessment, game);
      state.lastEventYear = assessment.year;
    }
    return state;
  }

  function respond(retention, responseId, game) {
    const original = normalize(retention), unchangedGame = clone(game);
    if (!original.pending) return {state: original, accepted: false, game: unchangedGame, record: null, message: '현재 선택할 학생 이탈 검토가 없습니다.'};
    const state = sync(original, game);
    if (!state.pending || state.pending.id !== original.pending.id || original.pending.year !== game.year) return {state, accepted: false, game: unchangedGame, record: null, message: '검토 조건이 바뀌어 학생 이탈 선택을 취소했습니다.'};
    const choice = state.pending.choices.find(entry => entry.id === responseId);
    if (!choice) return {state, accepted: false, game: unchangedGame, record: null, message: '알 수 없는 학생 이탈 대응입니다.'};
    if (!choice.available) return {state, accepted: false, game: unchangedGame, record: null, message: '선택한 지원에 필요한 예산이 부족합니다.'};
    const outcome = allocateLoss(Array.from(game.grades), game.special, choice.loss);
    const nextGame = clone(game);
    nextGame.grades = outcome.grades;
    nextGame.money = game.money - choice.cost;
    nextGame.happy = Math.min(100, game.happy + choice.happyChange);
    const record = {id: state.pending.id, year: game.year, reasons: state.pending.reasons.slice(), before: outcome.before, after: outcome.after, loss: outcome.loss, response: responseId, sourceIds: state.pending.sourceIds.slice(), beforeGrades: outcome.beforeGrades, afterGrades: outcome.afterGrades, gradeLosses: outcome.gradeLosses, specialBefore: game.special, specialAfter: nextGame.special, cost: choice.cost, happyChange: nextGame.happy - game.happy};
    state.history.push(record);
    state.pending = null;
    return {state, accepted: true, game: nextGame, record, message: choice.label + ': 게임상 전출 ' + outcome.loss + '명을 기록했습니다.'};
  }

  return {initial, normalize, assess, sync, respond};
})();
if (typeof module !== 'undefined') module.exports = RetentionModel;
