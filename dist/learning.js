'use strict';

// Support amounts, limits and timing are game assumptions, not grant eligibility rules.
const BudgetModel = (() => {
  const SUPPORT_AMOUNT = 24;
  const MAX_GRANTS = 3;
  const SUPPORT_GAP = 3;
  const PURPOSES = ['learning', 'transport', 'shared-curriculum'];
  const KINDS = ['policy', 'retention', 'allocation', 'support'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const validYear = value => Number.isInteger(value) && value > 0 && value <= 9999;
  const validGame = game => !!game && validYear(game.year) && finite(game.money);
  const ended = game => !!(game?.done || game?.organization?.ending || game?.lifecycle?.ending);
  const close = (a, b) => Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8;
  const balance = state => state.entries.length ? state.entries[state.entries.length - 1].balanceAfter : state.start.balance;
  const lastYear = state => state.entries.length ? state.entries[state.entries.length - 1].year : state.start.year;

  function initial(game, {legacy = false} = {}) {
    return {version: 1, start: {year: validYear(game?.year) ? game.year : 2026, balance: finite(game?.money) ? game.money : 100, legacy: !!legacy}, entries: [], grants: []};
  }

  function entryCopy(flow) {
    const entry = {id: flow.id, year: flow.year, kind: flow.kind, amount: flow.amount, balanceAfter: flow.balanceAfter};
    if (typeof flow.label === 'string' && flow.label) entry.label = flow.label;
    if (PURPOSES.includes(flow.purpose)) entry.purpose = flow.purpose;
    return entry;
  }

  function normalize(raw, game) {
    if (!raw || raw.version !== 1 || !validYear(raw.start?.year) || !finite(raw.start?.balance) || !Array.isArray(raw.entries)) return initial(game, {legacy: true});
    const state = {version: 1, start: {year: raw.start.year, balance: raw.start.balance, legacy: !!raw.start.legacy}, entries: [], grants: []};
    for (const flow of raw.entries) {
      if (!flow || typeof flow.id !== 'string' || !flow.id.trim() || state.entries.some(entry => entry.id === flow.id) || !validYear(flow.year) || flow.year < lastYear(state) || !KINDS.includes(flow.kind) || !finite(flow.amount) || !finite(flow.balanceAfter) || !close(balance(state) + flow.amount, flow.balanceAfter)) continue;
      if (flow.kind === 'retention' && flow.amount > 0) continue;
      if ((flow.kind === 'policy' || flow.kind === 'retention') && flow.amount < 0 && (balance(state) < -flow.amount || flow.balanceAfter < 0)) continue;
      if (flow.kind === 'support' && (flow.amount !== SUPPORT_AMOUNT || !PURPOSES.includes(flow.purpose) || state.grants.length >= MAX_GRANTS || state.grants.length && flow.year < state.grants[state.grants.length - 1].year + SUPPORT_GAP)) continue;
      const entry = entryCopy(flow);
      state.entries.push(entry);
      if (entry.kind === 'support') state.grants.push(entryCopy(entry));
    }
    return state;
  }

  function canAfford(game, cost) {
    return finite(game?.money) && finite(cost) && cost >= 0 && (cost === 0 || game.money >= cost);
  }

  function record(raw, flow, beforeGame, afterGame) {
    const state = normalize(raw, beforeGame);
    const reject = message => ({state, accepted: false, message});
    if (!validGame(beforeGame) || !validGame(afterGame) || !flow || typeof flow.id !== 'string' || !flow.id.trim() || !['policy', 'retention', 'allocation'].includes(flow.kind) || !validYear(flow.year)) return reject('예산 기록에 필요한 값이 올바르지 않습니다.');
    if (state.entries.some(entry => entry.id === flow.id)) return reject('이미 기록한 예산 흐름입니다.');
    if (ended(beforeGame)) return reject('운영이 끝난 게임에는 새 예산 흐름을 기록할 수 없습니다.');
    if (flow.year !== afterGame.year || flow.year < lastYear(state) || (flow.kind === 'allocation' ? afterGame.year !== beforeGame.year + 1 : afterGame.year !== beforeGame.year)) return reject('예산 기록의 연도가 맞지 않습니다.');
    if (!close(balance(state), beforeGame.money)) return reject('원장의 마지막 잔액과 현재 예산이 맞지 않습니다.');
    const amount = afterGame.money - beforeGame.money;
    if (!finite(amount) || flow.kind === 'retention' && amount > 0) return reject('예산 변동 금액이 올바르지 않습니다.');
    if ((flow.kind === 'policy' || flow.kind === 'retention') && amount < 0 && !canAfford(beforeGame, -amount)) return reject('이 선택에 필요한 예산이 부족합니다.');
    const entry = entryCopy({...flow, amount, balanceAfter: afterGame.money});
    state.entries.push(entry);
    return {state, accepted: true, message: '예산 흐름을 기록했습니다.'};
  }

  function support(raw, game, purpose) {
    const state = normalize(raw, game);
    const reject = message => ({state, game, accepted: false, message});
    if (!validGame(game) || !PURPOSES.includes(purpose)) return reject('지원금의 사용 목적을 선택해 주세요.');
    if (ended(game)) return reject('운영이 끝난 게임에서는 지원금을 받을 수 없습니다.');
    if (!close(balance(state), game.money) || game.year < lastYear(state)) return reject('원장의 마지막 잔액·연도와 현재 게임이 맞지 않습니다.');
    if (state.grants.length >= MAX_GRANTS) return reject('이번 게임의 지원금 3회를 모두 사용했습니다.');
    const previous = state.grants[state.grants.length - 1];
    if (previous && game.year < previous.year + SUPPORT_GAP) return reject(`${previous.year + SUPPORT_GAP}년부터 다음 지원금을 받을 수 있습니다.`);
    const id = 'support:' + game.year;
    if (state.entries.some(entry => entry.id === id)) return reject('올해 지원금은 이미 받았습니다.');
    const money = game.money + SUPPORT_AMOUNT;
    if (!finite(money) || money - game.money !== SUPPORT_AMOUNT) return reject('지원금 지급 후 잔액을 기록할 수 없습니다.');
    const entry = {id, year: game.year, kind: 'support', amount: SUPPORT_AMOUNT, balanceAfter: money, purpose};
    state.entries.push(entry);
    state.grants.push(entryCopy(entry));
    return {state, game: {...game, money}, accepted: true, message: '목적별 게임 지원금 24점을 받았습니다.'};
  }

  function summary(raw) {
    const state = normalize(raw);
    const result = {startBalance: state.start.balance, policyInflow: 0, policySpending: 0, retentionSpending: 0, allocationNet: 0, supportTotal: 0, recordedBalance: balance(state), entryCount: state.entries.length, grantCount: state.grants.length, nextSupportYear: state.grants.length ? state.grants[state.grants.length - 1].year + SUPPORT_GAP : state.start.year, remainingGrants: MAX_GRANTS - state.grants.length};
    for (const entry of state.entries) {
      if (entry.kind === 'policy') result[entry.amount < 0 ? 'policySpending' : 'policyInflow'] += Math.abs(entry.amount);
      if (entry.kind === 'retention') result.retentionSpending -= entry.amount;
      if (entry.kind === 'allocation') result.allocationNet += entry.amount;
      if (entry.kind === 'support') result.supportTotal += entry.amount;
    }
    return result;
  }

  return {initial, normalize, canAfford, record, support, summary};
})();
if (typeof module !== 'undefined') module.exports = BudgetModel;
