'use strict';
const $=id=>document.getElementById(id), clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const STORE='gyeongbuk-principal-population-v3:', META='gyeongbuk-principal-last';
let s=null, selected=null, toastTimer, effectTimer;
const schoolMap=new Map(SCHOOLS.map(x=>[x.id,x]));
const eventMap=new Map(events.map(x=>[x.id,x]));
const catalogVersion=typeof EVENT_CATALOG_VERSION==='number'?EVENT_CATALOG_VERSION:2;
const legacyEventIds=typeof LEGACY_EVENT_IDS!=='undefined'?LEGACY_EVENT_IDS:events.slice(0,8).map(x=>x.id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function legacyEventId(year){return legacyEventIds[((year-2026)%legacyEventIds.length+legacyEventIds.length)%legacyEventIds.length]}
function scheduledEventId(year){return events[((year-2026)%events.length+events.length)%events.length].id}
function nextEventId(state,year){
  if(state.eventCatalogVersion===catalogVersion&&state.eventScheduleMode!=='remaining')return scheduledEventId(year);
  const played=new Set(state.history.map(h=>h&&eventMap.has(h.eventId)?h.eventId:h&&Number.isInteger(h.year)?legacyEventId(h.year):null));
  played.add(state.eventId);
  return events.find(ev=>!played.has(ev.id))?.id||scheduledEventId(year);
}
function optionEvidence(option){
  const raw=option?.[4]&&typeof option[4]==='object'?option[4]:{};
  const catalog=typeof POLICY_SOURCES==='object'&&POLICY_SOURCES?POLICY_SOURCES:{};
  const ids=Array.isArray(raw.sourceIds)?[...new Set(raw.sourceIds.filter(id=>typeof id==='string'))]:[];
  const sources=ids.filter(id=>Object.prototype.hasOwnProperty.call(catalog,id)).map(id=>catalog[id]).filter(source=>source&&typeof source==='object');
  let level=['case','indirect','none'].includes(raw.level)?raw.level:'none';
  if(!sources.length)level='none';
  return {level,sources,note:typeof raw.note==='string'?raw.note:''};
}
function sourceLink(source){
  const title=esc(source.title||'제목이 제공되지 않은 출처');
  try{const url=new URL(source.url);if(url.protocol==='https:')return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${title}<span class="sr-only"> (새 창)</span></a>`}catch{}
  return `<span>${title}</span>`;
}
function evidenceMarkup(option,context='choice'){
  const evidence=optionEvidence(option),labels={case:'사례 근거',indirect:'간접 근거',none:'직접 근거 미확인'};
  const summary=context==='journal'?'선택한 정책의 근거·한계':'근거·한계 보기';
  const interpretation=evidence.level==='case'?'학생 유입이 함께 관찰된 사례입니다. 이 선택만의 인과효과나 같은 증가율을 입증하지는 않습니다.':evidence.level==='indirect'?'교육·돌봄·정책 운영의 참고 근거입니다. 입학생·전학생 증가를 직접 입증하지는 않습니다.':'이 선택이 학생 수를 늘린다는 직접 근거는 확인하지 못했습니다.';
  const kinds={case:'사례',research:'연구',policy:'정책·운영 자료'};
  const sources=evidence.sources.length?`<ul class="evidence-sources">${evidence.sources.map(source=>`<li><p class="evidence-source-title">${sourceLink(source)}</p><p class="evidence-source-meta">${esc([source.publisher,source.date,kinds[source.kind]].filter(Boolean).join(' · '))}</p>${source.finding?`<p><b>확인된 내용</b> ${esc(source.finding)}</p>`:''}${source.limitations?`<p><b>해석의 한계</b> ${esc(source.limitations)}</p>`:''}</li>`).join('')}</ul>`:'<p class="evidence-empty">연결된 출처가 없습니다.</p>';
  return `<div class="choice-evidence"><details class="evidence-details"><summary><span class="evidence-status ${evidence.level}">${labels[evidence.level]}</span><span class="evidence-toggle">${summary}</span><span class="sr-only"> — ${esc(option?.[0]||'정책')}</span></summary><div class="evidence-body"><p>${interpretation}</p>${evidence.note?`<p class="evidence-note">${esc(evidence.note)}</p>`:''}${sources}<p class="evidence-assumption">예산·지표 변화와 학생 수 효과의 모든 계수는 게임 가정이며, 출처에서 추정한 값이 아닙니다.</p></div></details></div>`;
}
function historyMarkup(entry){
  if(!entry||typeof entry!=='object')return '';
  const option=eventMap.get(entry.eventId)?.options?.[entry.optionIndex];
  const evidence=Number.isInteger(entry.optionIndex)&&entry.optionIndex>=0&&entry.optionIndex<3&&option?evidenceMarkup(option,'journal'):'';
  return `<div class="history-entry"><div class="history-title"><b>${esc(entry.year)}년</b><span>${esc(entry.title??'')}</span></div>${evidence}</div>`;
}
function notify(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000)}
function schoolCalendarChanges(school){
  const entries=[...(Array.isArray(school.lifecycleChanges)?school.lifecycleChanges:[]),...(DEMOGRAPHICS.schoolCalendar?.changes||[])];
  return [...new Map(entries.filter(change=>change&&typeof change==='object'&&String(change.schoolCode)===String(school.code)).map(change=>[change.changeId,change])).values()].sort((a,b)=>String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
}
function lifecycleSourcesMarkup(ids){
  const catalog=DEMOGRAPHICS.schoolCalendar?.sources||{},sources=[...new Set(ids||[])].filter(id=>Object.prototype.hasOwnProperty.call(catalog,id)).map(id=>catalog[id]);
  return `<details class="lifecycle-details"><summary>공식 일정 출처 · 확인 범위</summary><p>확인한 일정만 반영 · 미확정 학교 존치 가정. 이후 모든 학교의 운영 일정이 확인되었다는 뜻은 아닙니다. 확인일: ${esc(DEMOGRAPHICS.schoolCalendar?.checked||'미제공')}.</p><ul class="evidence-sources">${sources.map(source=>`<li><p class="evidence-source-title">${sourceLink(source)}</p><p class="evidence-source-meta">${esc([source.publisher,source.date].filter(Boolean).join(' · '))}</p><p>${esc(source.finding||'')}</p><p><b>해석의 한계</b> ${esc(source.limitations||'')}</p></li>`).join('')}</ul></details>`;
}
function lifecycleRecipientText(change){
  const names=Array.isArray(change.recipientNames)?change.recipientNames.filter(name=>typeof name==='string'):[];
  if(change.recipientStatus==='verified'&&names.length)return `확인된 배치학교: ${names.join(', ')}`;
  if(change.recipientStatus==='proposed'&&names.length)return `배치학교 제안: ${names.join(', ')} · 확정 미확인`;
  return '배치학교 미확인 · 특정 학교로의 배치를 확정해 표시하지 않습니다.';
}
function lifecycleStatusMarkup(school){
  const changes=schoolCalendarChanges(school);
  if(!changes.length)return '';
  const kinds={closure:'폐교',branch:'분교장 전환',rename:'교명 변경',affiliation:'분교 소속 변경'};
  return `<div class="lifecycle-status"><h3>확인된 학교 운영 일정</h3><ul>${changes.map(change=>`<li><b>${esc(change.effectiveDate)} · ${esc(kinds[change.kind]||'학교 개편')}</b> <span>${change.status==='effective'?'시행 확인':change.status==='approved'?'의결 · 시행 예정':'미확정'}</span>${change.afterName?`<p>${esc(change.schoolName)} → ${esc(change.afterName)}</p>`:''}${change.kind==='closure'?`<p>${esc(lifecycleRecipientText(change))}</p>`:''}</li>`).join('')}</ul><p>2026년 공시 ${school.base.toLocaleString('ko-KR')}명은 당시 관측값입니다. 게임은 그 시점부터의 가상 운영입니다. ${changes.some(change=>change.kind==='closure')?'확인된 폐교 일정에 이르면 운영을 마칩니다.':'분교장·소속·교명 변경은 폐교와 구분합니다.'}</p>${lifecycleSourcesMarkup(changes.flatMap(change=>change.sourceIds||[]))}</div>`;
}
function reconcileLifecycle(targetYear){const result=LifecycleModel.reconcile(s,schoolMap.get(s.schoolId),targetYear,DEMOGRAPHICS.schoolCalendar);s=result.state;return result}
function lifecycleSnapshotMarkup(record){
  const snapshot=record.snapshot,format=value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:5});
  return `<details class="lifecycle-details lifecycle-snapshot"><summary>보존한 게임 원본 진행 보기</summary><p>${snapshot.year}년 게임 기록 · 당시 모형 재학생 ${record.students.toLocaleString('ko-KR')}명. 아래 인원은 실제 역사 배치 실적이 아닙니다.</p><p>${esc(snapshot.last||'')}</p><table><caption>보존한 모형 학년별 인원</caption><thead><tr><th scope="col">구분</th><th scope="col">인원</th></tr></thead><tbody>${snapshot.grades.map((total,i)=>`<tr><th scope="row">${i+1}학년</th><td>${format(total)}명</td></tr>`).join('')}<tr><th scope="row">특수·순회 별도</th><td>${format(snapshot.special)}명</td></tr><tr><th scope="row">당시 총계</th><td>${record.students.toLocaleString('ko-KR')}명</td></tr></tbody></table><table><caption>보존한 연도별 게임 인원</caption><thead><tr><th scope="col">연도</th><th scope="col">모형 재학생</th></tr></thead><tbody>${snapshot.points.filter(point=>point&&Number.isFinite(point.year)&&Number.isFinite(point.total)).map(point=>`<tr><th scope="row">${esc(point.year)}년</th><td>${format(point.total)}명</td></tr>`).join('')}</tbody></table><details class="lifecycle-details"><summary>보존한 결정 일지 (${snapshot.history.length}개)</summary><ul>${snapshot.history.filter(entry=>entry&&typeof entry==='object').map(entry=>`<li><b>${esc(entry.year)}년</b> ${esc(entry.title||'')}</li>`).join('')}</ul></details></details>`;
}
function renderLifecycle(){
  const school=schoolMap.get(s.schoolId),record=s.lifecycle?.ending;
  $('schoolLifecycleStatus').innerHTML=lifecycleStatusMarkup(school);
  $('lifecycleEnding').hidden=!record;
  if(!record)return;
  $('narrative').textContent=record.legacyAdjustment?'운영 종료 이후의 가상 진행은 원본 기록에 보존하고, 표시 인원을 조정했습니다.':'확인된 학교 운영 종료 일정에 따른 졸업·배치 모의 기록을 남겼습니다.';
  $('studentDelta').textContent='운영 종료 · 이후 학교 재학생 0명';
  $('chartNote').textContent=record.legacyAdjustment?'운영 종료 · 이후 학교 재학생 0명. 원본 가상 진행과 모의 조정 내용은 운영 종료 기록에서 확인할 수 있습니다.':'운영 종료 · 이후 학교 재학생 0명. 졸업·배치 모의 인원과 원본 진행은 운영 종료 기록에서 확인할 수 있습니다.';
  const accounting=record.legacyAdjustment?`<p class="lifecycle-transfer">기존 가상 진행 ${record.lastEnrollment.toLocaleString('ko-KR')}명 기록 보존 · 모의 조정</p><p>이미 운영 종료 이후까지 진행한 저장을 보정했습니다. 이 조정은 실제 과거의 졸업·전학 인원을 뜻하지 않습니다.</p>`:`<p class="lifecycle-transfer">마지막 재학생 ${record.lastEnrollment.toLocaleString('ko-KR')}명 · 졸업 ${record.graduated.toLocaleString('ko-KR')}명 · 타교 배치 모의 ${record.transferred.toLocaleString('ko-KR')}명</p><p>졸업과 배치 인원은 게임 진행에서 계산한 기록이며 실제 역사 실적이 아닙니다.</p>`;
  $('lifecycleEnding').innerHTML=`<h2>공식 일정 반영 · ${esc(school.name)} 운영 종료</h2><p>${esc(record.effectiveDate)} 폐교 일정에 따라 ${record.firstZeroForecastYear}년부터 이 학교의 모형 재학생을 0명으로 표시합니다. 가상 통합·폐교를 승인한 결말과는 별도 기록입니다.</p>${accounting}<p>${esc(lifecycleRecipientText(record))}</p>${record.legacyReconciled?'<p>원래 진행은 아래 기록에 보존했습니다. 현재 연도와 결정 일지는 유지하고, 공개 그래프의 운영 종료 이후 인원을 0명으로 맞췄습니다.</p>':''}${lifecycleSnapshotMarkup(record)}${lifecycleSourcesMarkup(record.sourceIds)}`;
  $('next').disabled=true;$('step').textContent='확인된 폐교 일정에 따라 운영을 마쳤습니다';$('decisionBadge').textContent='공식 일정 · 운영 종료';
  document.querySelectorAll('#choices [data-choice]').forEach(button=>{button.disabled=true});
}
function organizationAssessment(state=s){return OrganizationModel.assess(state.grades,{special:state.special,year:state.year,school:schoolMap.get(state.schoolId)},OrganizationPolicy)}
function syncOrganization(){if(!s.lifecycle?.ending)s.organization=OrganizationModel.sync(s.organization,organizationAssessment(),s.year)}
function organizationLabels(assessment){
  const labels=[];
  if(assessment.zeroEnrollment)labels.push('재학생 0명');
  else{
    if(assessment.noIncoming)labels.push('모형상 일반학급 1학년 0명');
    if(assessment.emptyGrades.length)labels.push(`일반학급 ${assessment.emptyGrades.join('·')}학년 0명`);
  }
  if(assessment.pairCandidates.length)labels.push('복식 편성 후보 있음');
  if(assessment.capacityReview)labels.push('학급 수·정원 확인 필요');
  return labels;
}
function organizationSourcesMarkup(ids){
  const sources=[...new Set(ids)].filter(id=>Object.prototype.hasOwnProperty.call(OrganizationPolicy.sources,id)).map(id=>OrganizationPolicy.sources[id]);
  return `<details class="organization-details organization-sources"><summary>2026 기준 · 공식 출처와 해석의 한계</summary><p>2026 기준 참고·모의 편성안입니다. 미래 연도에 같은 기준이 유지된다는 보장은 없으며, 실제 학교의 학급 배정이나 통폐합 예정을 뜻하지 않습니다. 확인일: ${esc(OrganizationPolicy.checked)}.</p><p>현재 자료에는 실제 학급 수·학급별 인원과 동·읍·면 구분이 없습니다. 학년 전체 인원 비교는 학급 수와 정원을 확인할 참고 표시입니다.</p><ul class="evidence-sources">${sources.map(source=>`<li><p class="evidence-source-title">${sourceLink(source)}</p><p class="evidence-source-meta">${esc([source.publisher,source.date].filter(Boolean).join(' · '))}</p><p><b>확인된 내용</b> ${esc(source.finding||'')}</p><p><b>해석의 한계</b> ${esc(source.limitations||'')}</p></li>`).join('')}</ul></details>`;
}
function baselineOrganizationReviews(school){
  return Array.from({length:20},(_,i)=>{const year=2026+i,point=PopulationModel.forecast(school,year),assessment=OrganizationModel.assess(point.grades,{special:point.special,year,school},OrganizationPolicy);return {year,assessment,labels:organizationLabels(assessment)}}).filter(review=>review.labels.length&&!LifecycleModel.closureFor(school,review.year,DEMOGRAPHICS.schoolCalendar));
}
function baselineOrganizationMarkup(school){
  const reviews=baselineOrganizationReviews(school);
  if(!reviews.length)return '';
  const ids=reviews.flatMap(review=>review.assessment.sourceIds);
  return `<details class="baseline-details organization-preview"><summary>2026 기준 참고·모의 편성 검토 연도 (${reviews.length}개)</summary><p>각 연도의 추계 학년 인원에 2026 기준을 참고한 표시입니다. 실제 학급 배정, 미래 기준이나 폐교 시점을 예측한 값이 아닙니다. 이 표시는 위 학생 수 전망을 바꾸지 않습니다.</p><table><caption class="sr-only">${esc(school.name)}의 모의 편성 검토 참고 연도</caption><thead><tr><th scope="col">연도</th><th scope="col">검토 참고 조건</th></tr></thead><tbody>${reviews.map(review=>`<tr class="organization-preview-review" data-year="${review.year}"><th scope="row">${review.year}년</th><td><span class="organization-marker">${esc(review.labels.join(' · '))}</span></td></tr>`).join('')}</tbody></table>${organizationSourcesMarkup(ids)}</details>`;
}
function organizationButton(action,label,disabled=false){return `<button type="button" class="secondary" data-organization-action="${action}" ${disabled?'disabled':''}>${label}</button>`}
function organizationConsultationMarkup(org,year,disabled){
  const stage=org.consultation.stage;
  if(stage==='none')return `<details class="organization-details organization-scenario"><summary>가상 통합·폐교 협의 선택</summary><p>학생 수만으로 자동 통합·폐교하지 않습니다. 다음 선택은 주민·학부모·교육청과의 협의와 행정 절차를 단순화한 게임 시나리오입니다. 협의 시작, 다음 해 이후 지원·배치 준비, 그 다음 해 이후 최종 승인을 각각 선택합니다.</p><div class="organization-actions">${organizationButton('start-consultation','가상 통합·폐교 협의 시작',disabled)}</div></details>`;
  if(stage==='consulting')return `<div class="organization-consultation"><h3>가상 협의 진행 중</h3><p>${esc(org.consultation.startedYear)}년에 협의를 시작했습니다. 다음 해 이후에 학생 지원과 배치 준비를 선택할 수 있습니다.</p><div class="organization-actions">${organizationButton('prepare-support','가상 학생 지원·배치 준비',disabled||year<=org.consultation.startedYear)}${organizationButton('continue-operation','협의 중단 · 학교 운영 계속',disabled)}</div></div>`;
  return `<div class="organization-consultation"><h3>가상 지원·배치 준비 완료</h3><p>${esc(org.consultation.preparedYear)}년에 준비를 마쳤습니다. 그 다음 해 이후에 가상 결말을 최종 승인할 수 있습니다.</p><details class="organization-details organization-final"><summary>가상 통합·폐교 결말 선택</summary><p>이 게임의 해당 학교 운영을 마칩니다. 마지막 재학생 수와 원래 학교의 기록은 그대로 보존됩니다. 실제 학교에 대한 행정 결정은 아닙니다.</p><div class="organization-actions">${organizationButton('merge','가상 통합 최종 승인',disabled||year<=org.consultation.preparedYear)}${organizationButton('close','가상 폐교 최종 승인',disabled||year<=org.consultation.preparedYear)}</div></details><div class="organization-actions">${organizationButton('continue-operation','가상 결말 보류 · 학교 운영 계속',disabled)}</div></div>`;
}
function organizationPanelMarkup(assessment,org,year,done=false){
  const labels=organizationLabels(assessment),headings={'zero-enrollment':'모형상 재학생 0명인 해의 운영 검토','no-incoming':'모형상 일반 1학년 0명인 해의 검토','empty-grades':'모형상 일반학년 인원 없는 편성 검토',multigrade:'복식학급 모의 편성 검토',capacity:'학년 인원 기준 모의 검토'};
  const pending=org.pending,groups=org.combinedGroups;
  const groupLabel=group=>`${group.grades.join('·')}학년 함께 (${group.total}명)`;
  const capacity=assessment.capacity.mode==='exact'?`학급당 ${assessment.capacity.lower}명 기준 참고`:`학급당 ${assessment.capacity.lower}~${assessment.capacity.upper}명 범위 참고`;
  const sourceIds=[...assessment.sourceIds,...(OrganizationPolicy.closure?.sourceIds||[])];
  const facts=`<details class="organization-details organization-grade-details"><summary>학년별 인원과 모의 편성안 보기</summary><p>학년별 인원은 모형의 소수점 인원을 총계에 맞춰 정수로 나눈 모의 값입니다. 일반학년 ${assessment.regularTotal}명과 별도 집계 ${assessment.specialCount}명을 합한 총 ${assessment.total}명은 게임의 재학생 수와 같습니다.</p><table class="organization-grade-table"><thead><tr><th scope="col">학년</th><th scope="col">인원</th><th scope="col">모의 편성안</th></tr></thead><tbody>${assessment.grades.map((total,i)=>{const group=groups.find(group=>group.grades.includes(i+1));return `<tr><th scope="row">${i+1}학년</th><td>${total}명</td><td>${total===0?'학생 없음':group?esc(groupLabel(group)):'학년별 검토'}</td></tr>`}).join('')}</tbody></table><p>${esc(capacity)}. ${assessment.capacity.mode==='range'?'주소가 시·군 단위여서 동·읍·면 구분과 전년도 학급 수를 확정할 수 없습니다. ':''}특수·순회 인원은 복식 편성 후보에서 분리합니다.</p>${assessment.pairCandidates.length?`<p><b>가능 조합</b> ${assessment.pairCandidates.map(groupLabel).map(esc).join(', ')}</p><p>후보는 인접하지 않은 학년도 포함합니다. 제안된 편성안은 학년이 겹치지 않는 조합이며 실제 배정이 아닙니다.</p>`:''}</details>`;
  const reviewActions=pending&&!org.ending?`<div class="organization-actions">${assessment.suggestedGroups.length?organizationButton('apply-combined','제안된 복식 편성안 적용',done):''}${organizationButton('keep-separate','학년별 편성안 유지',done)}${organizationButton('support','수업·통학 지원 검토 기록',done)}${organizationButton('defer','이번 검토 보류',done)}</div>`:'';
  return `<h2>${org.ending?'가상 운영 결말 기록':pending?headings[pending.kind]||'학급·학교 운영 검토':'학급·학교 운영 검토'}</h2><p class="organization-reference">2026 기준 참고·모의 편성안</p><p class="organization-summary">${labels.length?esc(labels.join(' · ')):'현재 새 검토 조건은 없습니다.'}</p>${groups.length?`<p><b>적용한 모의 복식 편성안</b> ${groups.map(groupLabel).map(esc).join(', ')}</p>`:''}<p>편성과 협의 선택은 재학생 수·예산·만족도와 올해의 정책 선택을 바꾸지 않습니다.</p>${reviewActions}${facts}${org.ending?'':organizationConsultationMarkup(org,year,done)}${org.log.length?`<details class="organization-details organization-log"><summary>편성·운영 검토 기록 (${org.log.length}개)</summary><ol>${org.log.slice().reverse().map(entry=>`<li><b>${esc(entry.year)}년</b> ${esc(entry.title)}</li>`).join('')}</ol></details>`:''}${organizationSourcesMarkup(sourceIds)}`;
}
function renderOrganization(){
  if(s.lifecycle?.ending){$('organizationPanel').hidden=true;$('organizationEnding').hidden=true;return}
  $('organizationMessage').textContent='';
  const assessment=organizationAssessment(),org=s.organization,visible=organizationLabels(assessment).length||org.pending||org.combinedGroups.length||org.consultation.stage!=='none'||org.ending||org.log.length;
  $('organizationPanel').hidden=!visible;
  $('organizationContent').innerHTML=visible?organizationPanelMarkup(assessment,org,s.year,s.done):'';
  $('organizationEnding').hidden=!org.ending;
  if(org.ending){const label=org.ending.kind==='merged'?'가상 통합':'가상 폐교';$('organizationEnding').innerHTML=`<h2>${org.ending.year}년 · ${label} 결말</h2><p>협의와 지원·배치 준비 후 사용자가 승인한 게임 결말입니다. ${esc(schoolMap.get(s.schoolId).name)}의 마지막 재학생 ${org.ending.students.toLocaleString('ko-KR')}명과 원래 학교의 기록을 보존했습니다. 실제 행정 결정과 구분되며 이 결말로 재학생 수를 바꾸지 않습니다.</p>`;$('next').disabled=true;$('step').textContent=`${label} 결말로 학교 운영을 마쳤습니다`;$('decisionBadge').textContent='가상 운영 종료';document.querySelectorAll('#choices [data-choice]').forEach(button=>{button.disabled=true})}
}
function organizationAction(action){
  if(!s||s.done||s.organization?.ending||s.lifecycle?.ending)return;
  const result=OrganizationModel.act(s.organization,action,organizationAssessment(),s.year);
  if(!result.accepted){notify(result.message);return result}
  s.organization=result.state;renderOrganization();$('organizationMessage').textContent=result.message;
  if(!persist())notify('편성·운영 검토 기록을 저장하지 못했습니다. 현재 게임은 계속할 수 있습니다.');
  return result;
}
function initial(school){return {version:3,eventCatalogVersion:catalogVersion,eventId:events[0].id,organization:OrganizationModel.initial(),lifecycle:LifecycleModel.normalize(null),schoolId:school.id,base:school.base,year:2026,grades:school.grades.slice(),special:school.special,money:100,rep:50,teacher:60,happy:60,facilities:50,appeal:0,history:[],points:[{year:2026,total:school.base}],chosen:false,chosenIndex:null,done:false,last:`${school.name}의 교장으로 부임했습니다. 2026년 공시 학생 ${school.base.toLocaleString('ko-KR')}명에서 학교 이야기를 시작합니다.`}}
function loadSave(id){try{
  const v=JSON.parse(localStorage.getItem(STORE+id));
  if(!v||v.version!==3||v.schoolId!==id||!schoolMap.has(id)||!Array.isArray(v.grades)||v.grades.length!==6||!v.grades.every(x=>Number.isFinite(x)&&x>=0)||!Number.isFinite(v.special)||v.special<0||!Array.isArray(v.points)||!v.points.length||!v.points.every(p=>p&&Number.isFinite(p.total)&&Number.isFinite(p.year))||!Array.isArray(v.history)||v.base!==schoolMap.get(id).base||!Number.isInteger(v.year)||v.year<2026||v.year>2045||!['money','rep','happy','teacher','facilities','appeal'].every(k=>Number.isFinite(v[k])))return null;
  const legacy=v.eventCatalogVersion!==catalogVersion;
  v.eventCatalogVersion=legacy?1:catalogVersion;
  if(!eventMap.has(v.eventId))v.eventId=legacy?legacyEventId(v.year):scheduledEventId(v.year);
  v.chosen=v.chosen===true;
  if(!Number.isInteger(v.chosenIndex)||v.chosenIndex<0||v.chosenIndex>2)v.chosenIndex=null;
  if(!v.chosen)v.chosenIndex=null;
  v.done=v.done===true||v.year>=2045;
  v.organization=OrganizationModel.normalize(v.organization);
  v.lifecycle=LifecycleModel.normalize(v.lifecycle);
  return LifecycleModel.reconcile(v,schoolMap.get(id),v.year,DEMOGRAPHICS.schoolCalendar).state;
}catch{return null}}
function persist(){try{localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));localStorage.setItem(META,s.schoolId);return true}catch{return false}}
function listSchools(){const region=$('region').value,query=$('search').value.trim().replace(/\s/g,'').toLowerCase();const found=SCHOOLS.filter(x=>(!region||x.region===region)&&(!query||(x.name+x.region+x.address).replace(/\s/g,'').toLowerCase().includes(query)));$('resultCount').textContent=`총 ${found.length}개 학교·분교`;$('schoolList').innerHTML=found.length?found.map(x=>`<button class="school-option${selected?.id===x.id?' selected':''}" data-school="${esc(x.id)}" aria-pressed="${selected?.id===x.id}"><span>${esc(x.name)}</span><small>${esc(x.region)} ${selected?.id===x.id?'✓':'›'}</small></button>`).join(''):'<div class="no-results">검색 결과가 없습니다. 지역이나 학교명을 바꿔 보세요.</div>'}
function baselineSummary(school){
  const points=Array.from({length:20},(_,i)=>{const year=2026+i;return {year,total:PopulationModel.forecast(school,year).total}});
  const startTotal=points[0].total,endTotal=points[19].total,change=endTotal-startTotal;
  const percent=startTotal>0?change/startTotal*100:null;
  const roundedPercent=percent===null?null:Math.round(percent*10)/10;
  const changeText=`${change>0?'+':''}${change===0?0:change.toLocaleString('ko-KR')}명`;
  const percentText=roundedPercent===null?'비율 계산 불가 · 2026년 0명':`${roundedPercent>0?'+':''}${(roundedPercent===0?0:roundedPercent).toFixed(1)}%`;
  return {points,startTotal,endTotal,change,percent,changeText,percentText};
}
function baselineChartMarkup(school,summary=baselineSummary(school)){
  const maxTotal=Math.max(1,...summary.points.map(p=>p.total)),target=maxTotal*1.12,magnitude=10**Math.floor(Math.log10(target));
  const step=[1,2,3,4,5,6,8,10].find(value=>value>=target/magnitude)||10;
  const axisMax=Math.max(2,Math.ceil(step*magnitude/2)*2);
  const xx=year=>5+(year-2026)/19*590,yy=total=>200-total/axisMax*190;
  const line=summary.points.map(p=>`${xx(p.year).toFixed(2)},${yy(p.total).toFixed(2)}`).join(' ');
  const ticks=[2026,2030,2035,2040,2045];
  const label=`${school.name}, 추가 정책을 반영하지 않은 학생 수 전망. 2026년 ${summary.startTotal}명, 2045년 ${summary.endTotal}명. 세로축은 0명부터 시작합니다. 20개 연도의 값은 연도별 표에서 확인할 수 있습니다.`;
  return `<div class="baseline-chart"><p class="baseline-chart-heading">2026–2045년 학생 수 흐름 <span>단위: 명</span></p><div class="baseline-chart-body"><div class="baseline-ylabels" aria-hidden="true"><span style="top:10px">${axisMax.toLocaleString('ko-KR')}</span><span style="top:105px">${(axisMax/2).toLocaleString('ko-KR',{maximumFractionDigits:1})}</span><span style="top:200px">0</span></div><svg class="baseline-svg" viewBox="0 0 600 210" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><title>${esc(school.name)} · 추가 정책 미반영 학생 수 전망</title><path class="baseline-grid" d="M5 10H595M5 105H595"/><path class="baseline-zero" d="M5 200H595"/><polyline class="baseline-line" points="${line}"/>${summary.points.map(p=>`<circle class="baseline-point" data-year="${p.year}" data-total="${p.total}" cx="${xx(p.year).toFixed(2)}" cy="${yy(p.total).toFixed(2)}" r="2.8"><title>${p.year}년 ${p.total.toLocaleString('ko-KR')}명</title></circle>`).join('')}</svg><div class="baseline-xlabels" aria-hidden="true">${ticks.map(year=>`<span class="${year===2026?'first':year===2045?'last':''}" style="left:${((xx(year)/600)*100).toFixed(2)}%">${year}</span>`).join('')}</div></div></div>`;
}
function hasRegionalProjection(){return typeof DEMOGRAPHICS==='object'&&!!DEMOGRAPHICS.regionProjection}
function baselinePointType(year,school){if(school&&LifecycleModel.closureFor(school,year,DEMOGRAPHICS.schoolCalendar))return '운영 종료 반영';const type=year===2026?'공시':hasRegionalProjection()?(year<=2042?'시군 모형':'자체 연장'):'자체 추계';const kinds={branch:'분교장 전환',rename:'교명 변경',affiliation:'소속 변경'};const markers=school?schoolCalendarChanges(school).filter(change=>change.kind!=='closure'&&['approved','effective'].includes(change.status)&&Number(String(change.effectiveDate).slice(0,4))===year).map(change=>kinds[change.kind]).filter(Boolean):[];return [type,...markers].join(' · ')}
function baselineModelNote(){const assumption=DEMOGRAPHICS.forecastAssumptions?.primary;return (hasRegionalProjection()?'2026년은 공시입니다. 2027~2042년 시군 추계 기반 모형 · 2043~2045년 자체 연장입니다.':'2026년은 공시, 2027~2045년은 자체 추계입니다.')+(assumption?` 기본 가정: ${esc(assumption)}.`:'')+' 확인한 일정만 반영 · 미확정 학교 존치 가정. 추가 게임 정책과 저장된 선택 효과는 반영하지 않았습니다.'}
function baselineValidationMarkup(){
  const validation=typeof DEMOGRAPHICS==='object'?DEMOGRAPHICS.validation:null;
  if(!validation||!Array.isArray(validation.trainYears)||!['targetYear','matchedSchools','newSchoolIds','absentSchoolIds','meanAbsoluteError','medianAbsoluteError','weightedAbsolutePercentageError'].every(key=>Number.isFinite(validation[key])))return '';
  const format=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:2});
  const comparison=Number.isFinite(validation.lastYearCountMeanAbsoluteError)?` 비교 기준인 직전 연도 학생 수 유지의 평균 절대오차는 ${format(validation.lastYearCountMeanAbsoluteError)}명입니다.`:'';
  return `<p class="baseline-validation"><b>한 해 소급 점검:</b> ${esc(validation.trainYears.join('·'))}년 자료만 입력해 ${validation.targetYear}년을 계산하고 공통 학교 ID ${format(validation.matchedSchools)}개를 비교했습니다. 신규 ID ${format(validation.newSchoolIds)}개와 대상 연도에 없는 ID ${format(validation.absentSchoolIds)}개는 비교에서 제외했습니다. 평균 절대오차 ${format(validation.meanAbsoluteError)}명, 절대오차 중앙값 ${format(validation.medianAbsoluteError)}명, 가중 절대백분율오차(WAPE) ${format(validation.weightedAbsolutePercentageError)}%입니다.${comparison} 공통 ID의 한 해 점검이며 장기 정확도나 신뢰구간을 뜻하지 않습니다.</p>`;
}
function baselinePopulationMethodBody(){
  const current='<p>현재 자료의 명단은 학교알리미 2026년 공시 당시 학교·분교입니다. <a href="https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do" target="_blank" rel="noopener noreferrer">학교알리미 학년별·학급별 학생수</a>의 2024·2025·2026년 공시를 사용하며, 2026년 합계는 1~6학년과 별도 특수·순회학급을 포함한 당시 관측값입니다. 공시 이후 폐교한 학교의 현재 운영 여부와 구분합니다.</p>';
  const limits='<p>확인한 일정만 반영 · 미확정 학교 존치 가정. 미래 학교별 학생 수는 공식 학생배치계획이나 존치 보장이 아닌 모형 값입니다. 확인하지 못한 통학구역 변경, 학교 신설·통폐합, 주택 개발계획은 자동 반영하지 않습니다.</p>';
  const method=typeof DEMOGRAPHICS.method==='string'?`<p><b>학교별 배분 가정</b> ${esc(DEMOGRAPHICS.method)}</p>`:'<p>학교별 학년 진급과 관측 입학생 추세를 시군 인구 경로에 맞춰 배분한 자체 모형입니다.</p>';
  const game='<p>추가 개입이 없는 모형의 0명은 미확인 학교의 행정적 폐교를 뜻하지 않습니다. 긍정적인 게임 정책은 지역 학생의 가상 유입을 만드는 게임 가정이며, 효과 계수는 실측 정책 효과가 아닙니다. 확인된 폐교 일정에 이르면 학교 운영을 종료합니다.</p>';
  if(!hasRegionalProjection())return current+method+game+limits+baselineValidationMarkup();
  const reference=DEMOGRAPHICS.regionProjection;
  return current+`<p>시군 인구 자료는 ${sourceLink({title:reference.title,url:reference.source})} (${esc(reference.publisher)} · ${esc(reference.published)})를 사용합니다. 6~11세 인구는 7월 1일 기준으로 3개월 이상 거주하는 내·외국인을 포함한 거주인구이며 실제 재학생 수와 정의가 다릅니다. 2022년 경계 23개 시군 중 군위군을 제외한 현재 경북 22개 시군을 사용합니다.</p>`+method+game+`<p><b>2043~2045년은 자체 연장입니다.</b> 2042년 시군별 인구 수준에 ${sourceLink({title:'통계청 경북 6~11세 추계',url:reference.extension?.source})}의 2042년 대비 증감 비율을 적용합니다.</p><p>원자료: ${sourceLink({title:'시군 장래인구추계 통계표 (XLSX)',url:reference.downloadUrl})} · ${sourceLink({title:'시군 장래인구추계 보고서 (HWPX)',url:reference.reportUrl})}.</p>`+limits+lifecycleSourcesMarkup(Object.keys(DEMOGRAPHICS.schoolCalendar?.sources||{}))+baselineValidationMarkup();
}
function baselineMethodMarkup(){return `<details class="baseline-details baseline-method"><summary>계산 방법 · 공식 출처 · 전망의 한계</summary>${baselinePopulationMethodBody()}</details>`}
function baselineRegionMarkup(school){
  if(!hasRegionalProjection())return '';
  const region=DEMOGRAPHICS.regionalForecasts?.[school.region];
  if(!region)return '';
  const years=[2026,2030,2042];
  return `<details class="baseline-details baseline-region"><summary>${esc(school.region)} · 거주인구와 재학생 모형 비교</summary><p>6~11세 거주인구와 재학생 모형 목표는 서로 다른 값입니다. 2026년 공시 재학생 ${region.observed2026.toLocaleString('ko-KR')}명을 기준으로 인구 증감 비율을 적용합니다. 전체 모형 목표는 명단 내 학교 합계와 배치학교 미확인 모형 인원의 합입니다.</p><table><caption class="sr-only">${esc(school.region)}의 인구·학교 합계·배치학교 미확인 모형 인원, 단위 명</caption><thead><tr><th scope="col">연도</th><th scope="col">6~11세<br>거주인구</th><th scope="col">전체<br>모형 목표</th><th scope="col">명단 내<br>학교 합계</th><th scope="col">배치<br>미확인</th></tr></thead><tbody>${years.map(year=>{const pool=region.unassignedTotals?.[year]||0,schoolTotal=region.totals[year]-pool;return `<tr class="baseline-region-row" data-year="${year}" data-population="${region.population[year]}" data-target="${region.totals[year]}" data-unassigned="${pool}" data-school-total="${schoolTotal}"><th scope="row">${year}년</th><td>${region.population[year].toLocaleString('ko-KR')}</td><td>${region.totals[year].toLocaleString('ko-KR')}</td><td>${schoolTotal.toLocaleString('ko-KR')}</td><td>${pool.toLocaleString('ko-KR')}</td></tr>`}).join('')}</tbody></table><p>단위: 명. ‘배치 미확인’은 배치학교 미확인 모형 인원이며 실제 미배치 학생 수가 아닙니다. 확인된 폐교의 진급 인원을 별도로 보존하고 졸업에 따라 줄입니다.</p>${region.activeSchoolCount&&region.closedSchoolCount?`<p>2042년 모형의 명단 내 운영교 ${region.activeSchoolCount[2042]}개 · 폐교 반영 ${region.closedSchoolCount[2042]}개. 확인하지 못한 미래 일정은 존치 가정입니다.</p>`:''}<p>2043~2045년은 시군 공식 추계의 2042년 범위를 넘어선 자체 연장입니다. 학교별 미래 학생 수는 공식 학생배치계획이 아닙니다.</p></details>`;
}
function baselineShareComparisonMarkup(school){
  const assumptions=DEMOGRAPHICS.forecastAssumptions;
  if(!assumptions||!Array.isArray(school.intakeShareFixedPoints))return '';
  const fixed=new Map(school.intakeShareFixedPoints.map(point=>[point.year,point.total])),years=[2030,2035,2045];
  if(!years.every(year=>Number.isFinite(fixed.get(year))))return '';
  return `<table class="baseline-share-table"><caption>입학생 점유율 가정 비교</caption><thead><tr><th scope="col">연도</th><th scope="col">학교별 추세<br>지속 가정</th><th scope="col">점유율<br>고정 가정</th></tr></thead><tbody>${years.map(year=>{const primary=PopulationModel.forecast(school,year).total,comparison=fixed.get(year);return `<tr class="baseline-share-comparison" data-year="${year}" data-primary="${primary}" data-fixed="${comparison}"><th scope="row">${year}년</th><td>${primary.toLocaleString('ko-KR')}명</td><td>${comparison.toLocaleString('ko-KR')}명</td></tr>`}).join('')}</tbody></table><p>기본 모형: ${esc(assumptions.primary)}. 비교 모형: ${esc(assumptions.comparison)}. ${esc(assumptions.note||'')}</p>`;
}
function baselineRecoveryMarkup(school){
  const region=DEMOGRAPHICS.regionalForecasts?.[school.region],reference=DEMOGRAPHICS.regionProjection;
  if(!region?.minimum||!region.recovery||!reference)return '';
  const minimum=region.minimum,recovery=region.recovery,change=recovery.change,years=[...new Set([2026,minimum.year,recovery.year])].sort((a,b)=>a-b);
  return `<details class="baseline-details baseline-recovery"><summary>왜 감소가 멈추나요?</summary>${LifecycleModel.closureFor(school,2045,DEMOGRAPHICS.schoolCalendar)?'<p>이 학교의 0명은 확인된 운영 종료 일정의 반영입니다. 아래 시군 인구 경로는 이 학교의 존치 여부와 구분합니다.</p>':''}<p>${esc(school.region)}의 공식 6~11세 인구추계는 2026년 ${region.population[2026].toLocaleString('ko-KR')}명, 범위 내 최저인 ${minimum.year}년 ${minimum.population.toLocaleString('ko-KR')}명, ${recovery.year}년 ${recovery.population.toLocaleString('ko-KR')}명입니다. 최저 연도 대비 ${change>0?'+':''}${change.toLocaleString('ko-KR')}명인 추계 경로를 참고합니다.</p><table><caption class="sr-only">${esc(school.region)}의 공식 인구추계 최저 연도와 이후 경로</caption><thead><tr><th scope="col">연도</th><th scope="col">6~11세 거주인구</th></tr></thead><tbody>${years.map(year=>`<tr class="baseline-recovery-row" data-year="${year}" data-population="${region.population[year]}"><th scope="row">${year}년${year===minimum.year?' (최저)':''}</th><td>${region.population[year].toLocaleString('ko-KR')}명</td></tr>`).join('')}</tbody></table><p>학교별 곡선은 이 시군 인구 경로와 입학생 점유율·진급 추세의 배분 가정을 함께 반영합니다. 출생아와 6~11세 인구는 다른 연령 집단이며, 정체·반등은 학교 존치나 실제 학생 수의 보장이 아닙니다. </p><p>${sourceLink({title:reference.title,url:reference.source})}의 가정에 따른 추계입니다. 2043~2045년은 별도 자체 연장입니다.</p>${baselineShareComparisonMarkup(school)}</details>`;
}
function baselinePopulationPreviewMarkup(school){
  const summary=baselineSummary(school),milestones=summary.points.filter(p=>[2030,2035,2040,2045].includes(p.year));
  const observed=Object.entries(school.history||{}).filter(([year,total])=>Number(year)>=2024&&Number(year)<=2026&&Number.isFinite(total)).sort(([a],[b])=>Number(a)-Number(b));
  const direction=summary.change<0?'2045년은 2026년보다 적을 것으로 추계됩니다.':summary.change>0?'2045년은 2026년보다 많을 것으로 추계됩니다.':'2045년은 2026년과 같은 수준으로 추계됩니다.';
  return `<div class="baseline-report-header"><h2>${esc(school.name)}</h2><p>추가 게임 정책을 반영하지 않은 전망</p></div>${lifecycleStatusMarkup(school)}<div class="baseline-range"><div><span>2026년 공시</span><strong>${summary.startTotal.toLocaleString('ko-KR')}<small>명</small></strong></div><span class="baseline-arrow" aria-hidden="true">→</span><div><span>2045년 자체 추계</span><strong>${summary.endTotal.toLocaleString('ko-KR')}<small>명</small></strong></div></div><p class="baseline-change">2026년 대비 <b>${summary.changeText}</b> <span>(${summary.percentText})</span></p><p class="baseline-direction">${direction}</p>${baselineChartMarkup(school,summary)}<table class="baseline-milestones"><caption>중간 연도 전망</caption><thead><tr><th scope="col">연도</th><th scope="col">추가 정책 미반영 학생 수</th></tr></thead><tbody>${milestones.map(p=>`<tr class="baseline-milestone" data-year="${p.year}" data-total="${p.total}"><th scope="row">${p.year}년</th><td>${p.total.toLocaleString('ko-KR')}명</td></tr>`).join('')}</tbody></table><p class="baseline-note">${baselineModelNote()}</p><details class="baseline-details baseline-annual"><summary>2026~2045년 연도별 학생 수 보기</summary><table><caption class="sr-only">${esc(school.name)}의 연도별 기본 전망</caption><thead><tr><th scope="col">연도</th><th scope="col">학생 수</th><th scope="col">구분</th></tr></thead><tbody>${summary.points.map(p=>`<tr class="baseline-annual-row" data-year="${p.year}" data-total="${p.total}"><th scope="row">${p.year}년</th><td>${p.total.toLocaleString('ko-KR')}명</td><td>${baselinePointType(p.year,school)}</td></tr>`).join('')}</tbody></table></details><details class="baseline-details baseline-observed"><summary>2024~2026년 과거 공시 기록 보기</summary><p>아래는 과거 관측값이며 미래 추계와 구분됩니다.</p><table><caption class="sr-only">${esc(school.name)}의 과거 공시 학생 수</caption><thead><tr><th scope="col">공시 연도</th><th scope="col">학생 수</th></tr></thead><tbody>${observed.map(([year,total])=>`<tr><th scope="row">${esc(year)}년</th><td>${total.toLocaleString('ko-KR')}명</td></tr>`).join('')}</tbody></table></details>${baselineMethodMarkup()}`;
}
function baselinePreviewMarkup(school){return baselinePopulationPreviewMarkup(school)+baselineRegionMarkup(school)+baselineRecoveryMarkup(school)+baselineOrganizationMarkup(school)}
function selectSchool(id){selected=schoolMap.get(id);if(!selected)return;const saved=loadSave(id);$('selectedInfo').innerHTML=`<b>${esc(selected.name)}</b><small>${esc(selected.address)} · ${esc(selected.type)}</small>`;$('start').disabled=false;$('start').innerHTML=(saved?(saved.lifecycle?.ending?`${saved.year}년 운영 종료 기록 보기`:`${saved.year}년 게임 이어하기`):schoolCalendarChanges(selected).some(change=>change.kind==='closure')?'2026년 공시부터 가상 운영':'이 전망을 바꿔보기 · 게임 시작')+' <span>→</span>';$('forecastPreview').innerHTML=baselinePreviewMarkup(selected);$('previewLink').hidden=false;listSchools()}
function showSetup(){if(s){persist();$('cancelSetup').hidden=false;selected=schoolMap.get(s.schoolId);$('region').value=selected.region;$('search').value='';selectSchool(selected.id)}$('setup').hidden=false;$('game').hidden=true;window.scrollTo({top:0,behavior:'instant'})}
function enterGame(){if(!selected)return;const saved=loadSave(selected.id);s=saved||initial(selected);reconcileLifecycle(s.year);syncOrganization();$('setup').hidden=true;$('game').hidden=false;persist();render();const url=new URL(location.href);url.searchParams.set('school',s.schoolId);history.replaceState(null,'',url);window.scrollTo({top:0,behavior:'instant'});if(saved)notify(`${saved.year}년의 학교 이야기를 이어갑니다.`)}
function currentEvent(){return eventMap.get(s.eventId)||eventMap.get(s.eventCatalogVersion===catalogVersion?scheduledEventId(s.year):legacyEventId(s.year))||events[0]}
function updateScene(){const total=PopulationModel.total(s.grades,s.special),ratio=total/s.base,ev=currentEvent();$('scene').className='scene'+(ev.rain?' rain':'');$('season').textContent=['🌸 봄 학기','☀️ 여름 학기','🍁 가을 학기','❄️ 겨울 학기'][(s.year-2026)%4];$('mood').textContent=s.lifecycle?.ending?'학교 운영 종료':ratio<.45?'🏫 조용해진 교정':ratio<.8?'🌿 변화하는 학교':ratio>1.15?'🎉 북적이는 학교':'😊 활기찬 학교';$('schoolSign').textContent=PopulationModel.forecast(schoolMap.get(s.schoolId),s.year).displayName||schoolMap.get(s.schoolId).name;$('windows').innerHTML=Array.from({length:10},(_,i)=>`<div class="window ${i>=Math.ceil(ratio*8)?'off':''}"></div>`).join('');const n=s.lifecycle?.ending?0:Math.min(11,total),yardLabel=`재학생 ${total.toLocaleString('ko-KR')}명${total>11?' · 그림은 최대 11명까지 표시':''}`;$('yard').setAttribute('role','img');$('yard').setAttribute('aria-label',yardLabel);$('yard').setAttribute('title',yardLabel);$('yard').innerHTML=Array.from({length:n},(_,i)=>`<span class="person" aria-hidden="true" style="left:${7+i*8}%;animation-duration:${.8+i*.12}s;animation-delay:${i*.1}s">${['🧒','👧','👦'][i%3]}</span>`).join('');const result=Number.isInteger(s.chosenIndex)&&s.chosenIndex>=0&&s.chosenIndex<3?ev.options[s.chosenIndex]?.[3]:null;const icon=(s.chosen&&typeof result==='string'?result.match(/^\S+/)?.[0]:null)||ev.icon||'🏫';$('situation').textContent=s.lifecycle?.ending?'':s.done?'🎓':icon;$('situation').className=s.lifecycle?.ending?'situation':'situation '+(icon==='🚌'?'bus':'float')}
function animate(msg){const e=$('effect');e.textContent=msg.match(/^\S+/)?.[0]||'✨';e.classList.remove('play');void e.offsetWidth;e.classList.add('play');const icons=msg.startsWith('🌧')||msg.startsWith('☔')?['💧','🌧️']:['✨','⭐','🎊'];$('confetti').innerHTML=Array.from({length:18},(_,i)=>`<i style="left:${Math.random()*100}%;animation-delay:${Math.random()*.5}s">${icons[i%icons.length]}</i>`).join('');clearTimeout(effectTimer);effectTimer=setTimeout(()=>{$('confetti').innerHTML='';e.classList.remove('play')},2400)}
function render(){
  const school=schoolMap.get(s.schoolId),total=PopulationModel.total(s.grades,s.special),baseline=PopulationModel.forecast(school,s.year),orgEnded=!!s.organization?.ending,actualEnded=!!s.lifecycle?.ending,displayName=baseline.displayName||school.name;
  document.title=`${displayName} · 교장 인생 시뮬레이터`;$('location').textContent=`경상북도 ${school.region} · 나의 학교 이야기`;$('schoolName').textContent=displayName;$('year').textContent=s.year;$('students').innerHTML=total.toLocaleString('ko-KR')+'<span>명</span>';$('money').textContent=s.money;$('rep').textContent=s.rep;$('career').textContent=`${s.year-2025}년차 교장`;$('studentDelta').textContent=s.points.length>1?`지난해보다 ${total-s.points[s.points.length-2].total>=0?'+':''}${total-s.points[s.points.length-2].total}명`:'새로운 시작';$('narrative').textContent=s.last;$('next').disabled=!s.chosen||s.done||orgEnded||actualEnded;$('step').textContent=s.done?'20년의 학교 운영을 마쳤습니다':s.chosen?'결정 완료 · 다음 해로 진행':'올해의 결정을 내리세요';$('decisionBadge').textContent=s.done?'운영 종료':s.chosen?'결정 완료 ✓':'선택 대기';$('yearProgress').style.width=((s.year-2026)/19*100)+'%';updateScene();
  $('metrics').innerHTML=[['학생 만족',s.happy],['교사 만족',s.teacher],['시설 수준',s.facilities],['학교 평판',s.rep]].map(([k,v])=>`<div class="metric"><div class="metric-top"><span>${k}</span><b>${v}<small> / 100</small></b></div><div class="bar"><div style="width:${v}%"></div></div></div>`).join('');
  $('historyCount').textContent=`${s.history.length}개의 기록`;$('history').innerHTML=s.history.slice().reverse().map(historyMarkup).join('')||'아직 일지가 비어 있습니다. 첫 결정을 내려 보세요.';
  $('choiceAssumption').hidden=s.done&&!actualEnded;
  if(s.done&&!actualEnded){
    const score=Math.round(total*.35+s.rep*2+s.teacher+s.happy+s.facilities+s.money*.3);
    $('eventTitle').textContent='2045년, 당신이 남긴 학교';$('eventDesc').textContent=`최종 재학생 ${total}명 · 종합점수 ${score}점. ${total>baseline.total?'인구 기준선보다 많은 학생이 함께하는 학교를 만들었습니다!':total===baseline.total?'인구 변화 속에서 기준선 수준의 학교를 지켰습니다.':'인구 기준선과의 차이를 돌아보며 다음 학교 이야기를 준비해 보세요.'}`;
    $('choices').innerHTML='<button class="primary" id="endingRestart">새로운 교장 인생 시작 <span>↻</span></button>';$('endingRestart').onclick=reset;
  }else{
    const ev=currentEvent();$('eventTitle').textContent=ev.title;$('eventDesc').textContent=ev.desc;
    $('choices').innerHTML=ev.options.map((o,i)=>`<div class="choice-group"><button class="choice ${s.chosen&&s.chosenIndex===i?'picked':''}" ${s.chosen||orgEnded||actualEnded?'disabled':''} data-choice="${i}" aria-describedby="choiceAssumption"><span class="number">${s.chosen&&s.chosenIndex===i?'✓':String(i+1).padStart(2,'0')}</span><span class="choice-copy"><b>${esc(o[0])}</b><small>${esc(o[1])}</small></span></button>${evidenceMarkup(o)}</div>`).join('');
  }
  updateForecast(school,total);draw();renderOrganization();renderLifecycle();$('populationRecovery').innerHTML=baselineRecoveryMarkup(school);
}
function choose(i){if(!s||s.chosen||s.done||s.organization?.ending||s.lifecycle?.ending||!Number.isInteger(i)||i<0||i>2)return;const ev=currentEvent(),o=ev.options[i];if(!o)return;for(const[k,v]of Object.entries(o[2]))s[k]=k==='money'?Math.max(-50,s[k]+v):k==='appeal'?clamp(s[k]+v,-15,25):clamp(s[k]+v);s.chosen=true;s.chosenIndex=i;s.eventId=ev.id;s.last=o[3];s.history.push({year:s.year,title:o[0],eventId:ev.id,optionIndex:i});render();animate(o[3]);if(!persist())notify('저장 공간이 부족합니다. 현재 플레이는 계속할 수 있습니다.')}
function advance(){if(!s||!s.chosen||s.done||s.organization?.ending||s.lifecycle?.ending)return;const calendarResult=reconcileLifecycle(s.year+1);if(calendarResult.changed){persist();render();return}const followingEventId=nextEventId(s,s.year+1);if(s.eventCatalogVersion!==catalogVersion)s.eventScheduleMode='remaining';s.eventCatalogVersion=catalogVersion;const school=schoolMap.get(s.schoolId),old=PopulationModel.total(s.grades,s.special),previous=PopulationModel.forecast(school,s.year),next=PopulationModel.forecast(school,s.year+1),effects=PopulationModel.effects(s);s.grades=PopulationModel.transition(s.grades,previous,next,effects);s.special=next.special;s.year++;const total=PopulationModel.total(s.grades,s.special);s.money=clamp(s.money+Math.round(16+total/Math.max(1,s.base)*6)-Math.round(s.facilities*.035),-50,250);s.teacher=clamp(s.teacher-2);s.facilities=clamp(s.facilities-2);s.appeal=clamp(s.appeal-1,-15,25);s.points.push({year:s.year,total});const gap=total-next.total;s.last=`${s.year}년, ${total.toLocaleString('ko-KR')}명이 새 학년을 시작합니다. ${old>total?`지난해보다 ${old-total}명 감소.`:old<total?`지난해보다 ${total-old}명 증가.`:'지난해 학생 수 유지.'} 인구 기준선 ${next.total.toLocaleString('ko-KR')}명 대비 ${gap>=0?'+':''}${gap}명입니다.`;s.chosen=false;s.chosenIndex=null;s.done=s.year>=2045;if(!s.done)s.eventId=followingEventId;syncOrganization();render();animate(s.done?'🎓 교장 인생의 결말':'🎓 새로운 학년!');persist()}
function updateForecast(school,total){const base=PopulationModel.forecast(school,s.year),gap=total-base.total;const fx=PopulationModel.effects(s);$('comparison').innerHTML=`<span>인구 기준선<b>${base.total.toLocaleString('ko-KR')}명</b></span><span>내 선택의 차이<b class="${gap>=0?'positive':'negative'}">${gap>=0?'+':''}${gap.toLocaleString('ko-KR')}명</b></span>`;$('chartNote').textContent=`${s.year}년 기준 · 기준선은 자체 추계, 녹색 선은 게임 결과입니다. 현재 정책의 신입생 유입 효과 ${(fx.admission*100)>=0?'+':''}${(fx.admission*100).toFixed(1)}% (게임 가정).`;const played=new Map(s.points.map(p=>[p.year,p.total]));$('forecastTable').innerHTML='<table><thead><tr><th>연도</th><th>인구 기준선</th><th>내 학교</th><th>차이</th></tr></thead><tbody>'+school.forecast.map(p=>{const v=played.get(p.year),diff=v===undefined?null:v-p.total;return `<tr class="${p.year===s.year?'current':''}"><th>${p.year}${p.year===2026?' 공시':''}${LifecycleModel.closureFor(school,p.year,DEMOGRAPHICS.schoolCalendar)?'<small class="lifecycle-row-note">운영 종료 반영</small>':''}</th><td>${p.total.toLocaleString('ko-KR')}명</td><td>${v===undefined?'—':v.toLocaleString('ko-KR')+'명'}</td><td>${diff===null?'—':(diff>=0?'+':'')+diff+'명'}</td></tr>`}).join('')+'</tbody></table><p>2026년은 공시 값, 2027~2045년은 자체 추계. 미래의 내 학교 값은 게임을 진행하면 표시됩니다.</p>'}
function draw(){if(!s||$('game').hidden)return;const school=schoolMap.get(s.schoolId),c=$('chart'),r=c.getBoundingClientRect(),w=Math.max(200,r.width),h=r.height||155,d=Math.min(window.devicePixelRatio||1,3);c.width=w*d;c.height=h*d;const ctx=c.getContext('2d');if(!ctx)return;ctx.scale(d,d);ctx.clearRect(0,0,w,h);const arr=s.points,base=school.forecast,max=Math.max(1,...base.map(x=>x.total),...arr.map(x=>x.total))*1.12,left=39,right=w-14,top=14,bottom=h-24;ctx.strokeStyle='#e7eddf';ctx.fillStyle='#9caa8f';ctx.font='9px system-ui';for(let i=0;i<4;i++){const v=max*(1-i/3),y=top+(bottom-top)*i/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(Math.round(v).toLocaleString('ko-KR'),1,y+3)}const xx=y=>left+(y-2026)/19*(right-left),yy=v=>bottom-v/max*(bottom-top);ctx.strokeStyle='#a6aea0';ctx.lineWidth=1.7;ctx.setLineDash([4,4]);ctx.beginPath();base.forEach((p,i)=>i?ctx.lineTo(xx(p.year),yy(p.total)):ctx.moveTo(xx(p.year),yy(p.total)));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();arr.forEach((p,i)=>i?ctx.lineTo(xx(p.year),yy(p.total)):ctx.moveTo(xx(p.year),yy(p.total)));ctx.lineTo(xx(arr.at(-1).year),bottom);ctx.lineTo(left,bottom);ctx.closePath();const gradient=ctx.createLinearGradient(0,top,0,bottom);gradient.addColorStop(0,'#79a66940');gradient.addColorStop(1,'#79a66900');ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#38764e';ctx.lineWidth=2.4;ctx.beginPath();arr.forEach((p,i)=>i?ctx.lineTo(xx(p.year),yy(p.total)):ctx.moveTo(xx(p.year),yy(p.total)));ctx.stroke();ctx.fillStyle='#96a387';[2026,2030,2035,2040,2045].forEach(y=>ctx.fillText(y,xx(y)-11,h-6));const last=arr.at(-1);ctx.fillStyle='#dcb65e';ctx.beginPath();ctx.arc(xx(last.year),yy(last.total),4,0,Math.PI*2);ctx.fill();c.setAttribute('aria-label',`회색 인구 기준선: ${base.map(p=>p.year+'년 약 '+p.total+'명').join(', ')}. 내 선택의 결과: ${arr.map(p=>p.year+'년 '+p.total+'명').join(', ')}`)}
function reset(){if(!s||!confirm(`${schoolMap.get(s.schoolId).name}의 인구 반영판 진행을 지우고 2026년 공시 값에서 다시 시작할까요?`))return;s=initial(schoolMap.get(s.schoolId));syncOrganization();persist();render();notify('2026년 실제 공시 학생 수에서 다시 시작했습니다.')}
$('populationMethod').innerHTML=baselinePopulationMethodBody();
$('organizationPanel').onclick=e=>{const button=e.target.closest('[data-organization-action]');if(button&&!button.disabled)organizationAction(button.dataset.organizationAction)};
$('region').innerHTML+=[...new Set(SCHOOLS.map(x=>x.region))].sort((a,b)=>a.localeCompare(b,'ko')).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('schoolCount').textContent=SCHOOLS.length;$('region').onchange=listSchools;$('search').oninput=listSchools;$('schoolList').onclick=e=>{const b=e.target.closest('[data-school]');if(b)selectSchool(b.dataset.school)};$('choices').onclick=e=>{const b=e.target.closest('[data-choice]');if(b)choose(Number(b.dataset.choice))};$('start').onclick=enterGame;$('cancelSetup').onclick=()=>{if(s){$('setup').hidden=true;$('game').hidden=false;render();window.scrollTo({top:0,behavior:'instant'})}};$('switchSchool').onclick=showSetup;$('next').onclick=advance;$('restart').onclick=reset;$('save').onclick=()=>notify(persist()?'현재 기기에 진행 상황을 저장했습니다.':'진행 상황을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');addEventListener('resize',draw);addEventListener('pagehide',()=>{if(s)persist()});
let preferred=new URLSearchParams(location.search).get('school');if(!preferred){try{preferred=localStorage.getItem(META)}catch{}}if(preferred&&schoolMap.has(preferred)){selectSchool(preferred);$('region').value=selected.region}listSchools();
