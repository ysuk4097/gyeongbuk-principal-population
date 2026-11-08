'use strict';

// Organization changes are a simulation. They never change enrollment or game metrics.
const OrganizationModel = (() => {
  const kinds = new Set(['zero-enrollment', 'no-incoming', 'empty-grades', 'multigrade', 'capacity']);
  const stages = new Set(['none', 'consulting', 'ready']);
  const sum = values => values.reduce((total, value) => total + value, 0);
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  const validYear = value => Number.isInteger(value) && value >= 0 && value <= 9999;
  const currentYear = value => validYear(value) ? value : 2026;
  const strings = values => Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string' && value.trim()))] : [];
  const pairKey = group => group.grades.join('-');
  const cloneGroup = group => ({grades: group.grades.slice(), total: group.total});
  const validKey = key => typeof key === 'string' && /^(zero-enrollment|no-incoming|empty-grades|multigrade|capacity)(?::[1-6,\-]+)?$/.test(key);

  function initial() {
    return {
      version: 1,
      combinedGroups: [],
      handledKeys: [],
      pending: null,
      consultation: {stage: 'none', startedYear: null, preparedYear: null},
      ending: null,
      log: []
    };
  }

  function normalize(raw) {
    const state = initial();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return state;
    const used = new Set();
    if (Array.isArray(raw.combinedGroups)) {
      for (const group of raw.combinedGroups) {
        if (!group || !Array.isArray(group.grades) || group.grades.length !== 2) continue;
        const grades = group.grades.slice().sort((a, b) => a - b);
        if (!grades.every(grade => Number.isInteger(grade) && grade >= 1 && grade <= 6) || grades[0] === grades[1]) continue;
        if (grades.some(grade => used.has(grade)) || !Number.isInteger(group.total) || group.total <= 0) continue;
        grades.forEach(grade => used.add(grade));
        state.combinedGroups.push({grades, total: group.total});
      }
      state.combinedGroups.sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
    }
    state.handledKeys = strings(raw.handledKeys).filter(validKey);
    const pending = raw.pending;
    if (pending && kinds.has(pending.kind) && validKey(pending.key) && pending.key.split(':')[0] === pending.kind && validYear(pending.year) && !state.handledKeys.includes(pending.key)) {
      state.pending = {key: pending.key, kind: pending.kind, year: pending.year};
    }
    const consultation = raw.consultation;
    if (consultation && stages.has(consultation.stage) && consultation.stage !== 'none' && validYear(consultation.startedYear)) {
      state.consultation = {stage: 'consulting', startedYear: consultation.startedYear, preparedYear: null};
      if (consultation.stage === 'ready' && validYear(consultation.preparedYear) && consultation.preparedYear > consultation.startedYear) {
        state.consultation.stage = 'ready';
        state.consultation.preparedYear = consultation.preparedYear;
      }
    }
    const ending = raw.ending;
    if (ending && ['merged', 'closed'].includes(ending.kind) && validYear(ending.year) && Number.isInteger(ending.students) && ending.students >= 0) {
      state.ending = {kind: ending.kind, year: ending.year, students: ending.students};
      state.pending = null;
    } else if (ending?.kind === 'zero-enrollment' && validYear(ending.year) && ending.year > 0 && ending.students === 0 && ending.automatic === true && ending.gameRule === true) {
      state.ending = {kind: 'zero-enrollment', reason: 'zero-enrollment', year: ending.year, students: 0, automatic: true, gameRule: true};
      state.pending = null;
    }
    if (Array.isArray(raw.log)) {
      for (const entry of raw.log) {
        if (!entry || !validYear(entry.year) || typeof entry.kind !== 'string' || !entry.kind.trim() || typeof entry.title !== 'string' || !entry.title.trim()) continue;
        const normalized = {year: entry.year, kind: entry.kind, title: entry.title};
        const sourceIds = strings(entry.sourceIds);
        if (sourceIds.length) normalized.sourceIds = sourceIds;
        state.log.push(normalized);
      }
    }
    return state;
  }

  function integerGrades(raw) {
    const values = Array.from({length: 6}, (_, index) => number(Array.isArray(raw) ? raw[index] : 0));
    const grades = values.map(Math.floor);
    const remainder = Math.floor(sum(values) + .5) - sum(grades);
    const ranked = values.map((value, index) => ({index, fraction: value - grades[index]}))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let index = 0; index < remainder; index++) grades[ranked[index].index]++;
    return {values, grades};
  }

  function matching(candidates) {
    let best = [];
    const key = groups => groups.map(pairKey).join(',');
    function visit(available, selected) {
      if (!available.length) {
        const ordered = selected.slice().sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
        if (ordered.length > best.length || (ordered.length === best.length && key(ordered) < key(best))) best = ordered;
        return;
      }
      const [first, ...rest] = available;
      visit(rest, selected);
      for (const candidate of candidates) {
        if (candidate.grades[0] !== first || !rest.includes(candidate.grades[1])) continue;
        visit(rest.filter(grade => grade !== candidate.grades[1]), selected.concat(candidate));
      }
    }
    visit([1, 2, 3, 4, 5, 6], []);
    return best.map(cloneGroup);
  }

  function assess(rawGrades, context = {}, policy) {
    const reference = policy || (typeof OrganizationPolicy !== 'undefined' ? OrganizationPolicy : null);
    if (!reference || !reference.multigrade || !reference.capacity) throw new TypeError('OrganizationPolicy is required');
    const settings = context && typeof context === 'object' ? context : {};
    const {values, grades} = integerGrades(rawGrades);
    const regularTotal = sum(grades);
    // Use the same single rounding as the headline; rounding special separately can disagree.
    const total = Math.floor(sum(values) + number(settings.special) + .5);
    const specialCount = total - regularTotal;
    const emptyGrades = grades.flatMap((count, index) => count === 0 ? [index + 1] : []);
    const pairCandidates = [];
    for (let first = 0; first < 6; first++) for (let second = first + 1; second < 6; second++) {
      if (grades[first] > 0 && grades[second] > 0 && grades[first] <= reference.multigrade.perGradeMax && grades[second] <= reference.multigrade.perGradeMax && grades[first] + grades[second] <= reference.multigrade.pairTotalMax) {
        pairCandidates.push({grades: [first + 1, second + 1], total: grades[first] + grades[second]});
      }
    }
    const limits = reference.capacity;
    const name = typeof settings.school === 'string' ? settings.school : settings.school?.name;
    let capacity;
    if (Array.isArray(limits.specialSchoolNames) && limits.specialSchoolNames.includes(name)) {
      capacity = {mode: 'exact', lower: limits.specialSchoolMax, upper: limits.specialSchoolMax};
    } else if (settings.locality === 'dong') {
      capacity = {mode: 'exact', lower: limits.dong, upper: limits.dong};
    } else if (settings.locality === 'eupMyeon' && total < limits.largeRuralMin) {
      capacity = {mode: 'exact', lower: limits.eupMyeon, upper: limits.eupMyeon};
    } else {
      // A city/county-only address is not evidence of dong or eup/myeon locality.
      capacity = {mode: 'range', lower: limits.flexibleMin, upper: limits.flexibleMax};
    }
    return {
      grades,
      regularTotal,
      specialCount,
      total,
      emptyGrades,
      noIncoming: grades[0] === 0 && total > 0,
      zeroEnrollment: total === 0,
      pairCandidates,
      suggestedGroups: matching(pairCandidates),
      capacity,
      capacityReview: grades.some(count => count > capacity.lower),
      sourceIds: strings([...(reference.multigrade.sourceIds || []), ...(limits.sourceIds || []), ...(reference.closure?.sourceIds || [])]),
      referenceYear: reference.referenceYear
    };
  }

  function review(assessment) {
    if (assessment.zeroEnrollment) return {kind: 'zero-enrollment', key: 'zero-enrollment', title: '재학생이 없는 학교의 운영 검토'};
    if (assessment.noIncoming) return {kind: 'no-incoming', key: 'no-incoming:1', title: '모형상 일반학급 1학년이 0명인 구성 검토'};
    if (assessment.emptyGrades.length) return {kind: 'empty-grades', key: 'empty-grades:' + assessment.emptyGrades.join(','), title: '모형상 일반학급 학생이 없는 학년의 교육과정 검토'};
    if (assessment.pairCandidates.length) return {kind: 'multigrade', key: 'multigrade:' + assessment.pairCandidates.map(pairKey).join(','), title: '복식학급 후보와 수업 지원 검토'};
    if (assessment.capacityReview) return {kind: 'capacity', key: 'capacity:' + assessment.grades.flatMap((count, index) => count > assessment.capacity.lower ? [index + 1] : []).join(','), title: '학급당 학생 수 기준에 따른 편성 검토'};
    return null;
  }

  function appendLog(state, year, kind, title, assessment) {
    const entry = {year, kind, title};
    const sourceIds = strings(assessment.sourceIds);
    if (sourceIds.length) entry.sourceIds = sourceIds;
    state.log.push(entry);
  }

  function sync(org, assessment, year) {
    const state = normalize(org);
    if (state.ending) return state;
    const eligible = new Map(assessment.pairCandidates.map(group => [pairKey(group), group]));
    state.combinedGroups = state.combinedGroups.filter(group => eligible.has(pairKey(group))).map(group => cloneGroup(eligible.get(pairKey(group))));
    const next = review(assessment);
    if (!next || state.handledKeys.includes(next.key)) {
      state.pending = null;
      return state;
    }
    if (state.pending?.key === next.key) return state;
    state.pending = {key: next.key, kind: next.kind, year: currentYear(year)};
    // Persist the stable review key in kind, so leaving and revisiting a condition also logs once.
    const logKind = 'review:' + next.key;
    if (!state.log.some(entry => entry.kind === logKind)) appendLog(state, currentYear(year), logKind, next.title, assessment);
    return state;
  }

  function acknowledge(state) {
    if (state.pending && !state.handledKeys.includes(state.pending.key)) state.handledKeys.push(state.pending.key);
    state.pending = null;
  }

  function autoClose(org, assessment, year) {
    const state = normalize(org);
    if (state.ending || assessment?.total !== 0 || !validYear(year) || year === 0) return {state, changed: false};
    // This user-selected game rule is separate from verified school closure calendars.
    state.ending = {kind: 'zero-enrollment', reason: 'zero-enrollment', year, students: 0, automatic: true, gameRule: true};
    state.pending = null;
    state.log.push({year, kind: 'automatic-zero-enrollment', title: '전체 학생 0명으로 게임 규칙에 따른 자동 폐교'});
    return {state, changed: true};
  }

  function act(org, action, assessment, year) {
    const state = normalize(org);
    const result = (accepted, message) => ({state, accepted, message});
    if (state.ending) return result(false, '이미 학교 운영 결말을 선택했습니다.');
    if (!validYear(year)) return result(false, '유효한 검토 연도가 필요합니다.');
    let title;
    switch (action) {
      case 'keep-separate':
        if (!state.pending && !state.combinedGroups.length) return result(false, '이미 학년별 수업을 유지하고 있습니다.');
        state.combinedGroups = [];
        title = '학년별 수업 유지';
        break;
      case 'apply-combined': {
        if (!assessment.suggestedGroups.length) return result(false, '현재 기준에 맞는 복식학급 후보가 없습니다.');
        const groups = assessment.suggestedGroups.map(cloneGroup);
        if (!state.pending && JSON.stringify(state.combinedGroups) === JSON.stringify(groups)) return result(false, '이미 같은 복식학급 구성을 적용했습니다.');
        state.combinedGroups = groups;
        title = '복식학급 모의 구성 적용';
        break;
      }
      case 'support':
        if (!state.pending) return result(false, '현재 처리할 운영 검토가 없습니다.');
        title = '수업·통학 등 운영 지원 검토 기록';
        break;
      case 'defer':
        if (!state.pending) return result(false, '현재 보류할 운영 검토가 없습니다.');
        title = '현재 운영 검토 보류';
        break;
      case 'start-consultation':
        if (state.consultation.stage !== 'none') return result(false, '이미 교육공동체 협의를 진행하고 있습니다.');
        state.consultation = {stage: 'consulting', startedYear: year, preparedYear: null};
        title = '학교 운영 방향 교육공동체 협의 시작';
        break;
      case 'prepare-support':
        if (state.consultation.stage !== 'consulting') return result(false, '먼저 교육공동체 협의를 시작해야 합니다.');
        if (year <= state.consultation.startedYear) return result(false, '협의를 시작한 다음 연도부터 지원 계획을 준비할 수 있습니다.');
        state.consultation.stage = 'ready';
        state.consultation.preparedYear = year;
        title = '학생 교육·통학 지원 계획 준비';
        break;
      case 'continue-operation':
        if (state.consultation.stage === 'none' && !state.pending) return result(false, '이미 학교 운영을 계속하고 있습니다.');
        state.consultation = {stage: 'none', startedYear: null, preparedYear: null};
        title = '학교 운영 계속 선택';
        break;
      case 'merge':
      case 'close':
        if (state.consultation.stage !== 'ready') return result(false, '협의와 학생 지원 계획 준비를 먼저 마쳐야 합니다.');
        if (year <= state.consultation.preparedYear) return result(false, '지원 계획을 준비한 다음 연도부터 결말을 선택할 수 있습니다.');
        state.ending = {kind: action === 'merge' ? 'merged' : 'closed', year, students: assessment.total};
        title = action === 'merge' ? '학교 통합 모의 결말 선택' : '학교 폐지 모의 결말 선택';
        break;
      default:
        return result(false, '알 수 없는 학교 운영 선택입니다.');
    }
    acknowledge(state);
    appendLog(state, year, action, title, assessment);
    return result(true, title + ' 기록을 남겼습니다.');
  }

  return {initial, normalize, assess, sync, autoClose, act};
})();
if (typeof module !== 'undefined') module.exports = OrganizationModel;
