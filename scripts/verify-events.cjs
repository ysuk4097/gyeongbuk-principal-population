'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const dist=path.resolve(__dirname,'../dist');
const read=name=>fs.readFileSync(path.join(dist,name),'utf8');

// Exercise the actual buildless application with a minimal DOM, without a browser dependency.
function boot({savedEntries=[],search=''}={}){
  const nodes=new Map(),storage=new Map(savedEntries),writes=[],scrolls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{id,value:'',hidden:id==='game',disabled:false,innerHTML:'',textContent:'',style:{},className:'',classList:{add(){},remove(){}},querySelectorAll(){return []},getBoundingClientRect(){return {width:400,height:155}},getContext(){return null},setAttribute(){},scrollIntoView(options){scrolls.push({id,options})},get offsetWidth(){return 400}});
    return nodes.get(id);
  };
  const context=vm.createContext({console,URL,URLSearchParams,location:{href:'https://example.com/game/'+search,search},document:{getElementById:element,querySelectorAll(){return []},title:''},window:{scrollTo(){},matchMedia(){return {matches:false}},devicePixelRatio:1},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{writes.push({key:k,value:v});storage.set(k,v)}},addEventListener(){},setTimeout(){return 1},clearTimeout(){},confirm(){return true}});
  for(const name of ['schools.js','events.js','evidence.js','simulation.js','organization-policy.js','organization.js','lifecycle.js','app.js'])vm.runInContext(read(name),context,{filename:name});
  return {run:source=>vm.runInContext(source,context),nodes,storage,writes,scrolls};
}
const game=boot();
const catalogue=game.run('events');
const sources=game.run('POLICY_SOURCES');
assert.equal(catalogue.length,19,'The 2026–2044 decisions should each have a unique event');
assert.equal(new Set(catalogue.map(e=>e.id)).size,catalogue.length);
for(const event of catalogue){
  assert.match(event.id,/^[a-z][a-z0-9-]+$/);
  assert.ok(event.icon&&event.title&&event.desc);
  assert.equal(event.options.length,3);
  for(const option of event.options){
    assert.equal(option.length,5,`${event.id}: evidence metadata is mandatory`);
    assert.ok(option[0]&&option[1]&&option[3]);
    assert.ok(Object.keys(option[2]).length);
    for(const [key,value] of Object.entries(option[2])){
      assert.ok(['money','rep','teacher','happy','facilities','appeal'].includes(key));
      assert.ok(Number.isFinite(value));
    }
    const evidence=option[4];
    assert.ok(['case','indirect','none'].includes(evidence.level));
    assert.ok(Array.isArray(evidence.sourceIds)&&evidence.note.trim());
    assert.equal(new Set(evidence.sourceIds).size,evidence.sourceIds.length);
    if(evidence.level==='none')assert.equal(evidence.sourceIds.length,0);
    else assert.ok(evidence.sourceIds.length,`${event.id}: supported option requires sources`);
    for(const id of evidence.sourceIds){
      assert.ok(sources[id],`${event.id}: unknown source ${id}`);
      if(evidence.level==='case')assert.ok(evidence.sourceIds.some(ref=>sources[ref]?.kind==='case'));
    }
  }
}
for(const [id,source] of Object.entries(sources)){
  for(const key of ['title','publisher','date','finding','limitations'])assert.ok(source[key]?.trim(),`${id}: missing ${key}`);
  assert.ok(['case','research','policy'].includes(source.kind));
  assert.equal(new URL(source.url).protocol,'https:');
}

// All three decision strategies reach the existing ending, and a second click cannot reapply effects.
for(const strategy of [0,1,2]){
  game.run('s=initial(SCHOOLS[0])');
  const seen=new Set();
  for(let year=2026;year<2045;year++){
    assert.equal(game.run('s.year'),year);
    assert.ok(!game.run('s.done'));
    const id=game.run('currentEvent().id');
    assert.ok(!seen.has(id),`Repeated event ${id}`);seen.add(id);
    game.run(`choose(${strategy})`);
    const chosen=game.run('JSON.stringify(s)');
    game.run(`choose(${(strategy+1)%3})`);
    assert.equal(game.run('JSON.stringify(s)'),chosen,'Repeated selection must not apply effects');
    assert.equal(game.run('s.history.at(-1).eventId'),id);
    assert.equal(game.run('s.history.at(-1).optionIndex'),strategy);
    const markup=game.nodes.get('choices').innerHTML;
    assert.ok(markup.includes('disabled'),'Choices should lock after selection');
    assert.ok(markup.includes('<details'),'Evidence must remain outside the locked choice');
    for(const button of markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g))assert.ok(!/<details\b|<a\b/.test(button[0]),'Interactive evidence must not be nested in a choice button');
    for(const anchor of markup.matchAll(/<a\b[^>]*href="https:[^"]*"[^>]*>/g)){
      assert.match(anchor[0],/target="_blank"/);
      assert.match(anchor[0],/rel="[^"]*noopener[^"]*noreferrer[^"]*"/);
    }
    game.run('advance()');
    assert.ok(game.run("s.grades.every(x=>Number.isFinite(x)&&x>=0)&&['money','rep','teacher','happy','facilities','appeal'].every(k=>Number.isFinite(s[k]))"));
  }
  assert.equal(seen.size,19);
  assert.equal(game.run('s.year'),2045);
  assert.ok(game.run('s.done'));
  assert.equal(game.run('s.history.length'),19);
  assert.equal(game.run('s.points.length'),20);
  assert.ok(game.nodes.get('eventTitle').textContent.includes('2045'));
  const ending=game.run('JSON.stringify(s)');game.run('advance();choose(0)');
  assert.equal(game.run('JSON.stringify(s)'),ending);
}

// Saves made before the event expansion used the original eight-event modulo schedule.
for(let year=2026;year<2045;year++)for(const chosen of [false,true]){
  game.run(`s=initial(SCHOOLS[0]);s.year=${year};s.chosen=${chosen};s.chosenIndex=${chosen?2:'null'};delete s.eventId;delete s.eventCatalogVersion;delete s.organization;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId)`);
  assert.ok(game.run('s'),`${year}: legacy save must load`);
  assert.equal(game.run('currentEvent().id'),catalogue[(year-2026)%8].id,`${year}: preserve original current event`);
  assert.equal(game.run('s.chosen'),chosen);
  assert.equal(game.run('s.chosenIndex'),chosen?2:null);
  assert.equal(game.run('s.organization.version'),1,'Pre-organization saves receive default organization state');
  game.run('render()');
  if(chosen){const old=game.run('JSON.stringify(s)');game.run('choose(0)');assert.equal(game.run('JSON.stringify(s)'),old)}
  else game.run('choose(2)');
  const selectedId=game.run('currentEvent().id');
  game.run('persist();s=loadSave(s.schoolId)');
  assert.equal(game.run('currentEvent().id'),selectedId,'Pinned event must survive repeated reloads');
  game.run('advance()');
  assert.equal(game.run('s.year'),year+1);
}
// A real pre-expansion journal has title/year entries only, including the selected 2034 repeat.
const oldJournal=catalogue.slice(0,8).map((event,i)=>({year:2026+i,title:event.options[0][0]}));
oldJournal.push({year:2034,title:catalogue[0].options[2][0]});
game.run(`s=initial(SCHOOLS[0]);s.year=2034;s.grades=PopulationModel.forecast(SCHOOLS[0],2034).grades.slice();s.history=${JSON.stringify(oldJournal)};s.chosen=true;s.chosenIndex=2;s.money=110;s.rep=44;delete s.eventId;delete s.eventCatalogVersion;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId)`);
assert.equal(game.run('currentEvent().id'),catalogue[0].id);
const oldChoice=game.run('JSON.stringify(s)');game.run('choose(0)');
assert.equal(game.run('JSON.stringify(s)'),oldChoice,'Loading a selected old event must not apply another choice');
const alreadyPlayed=new Set(catalogue.slice(0,8).map(event=>event.id));
game.run('advance()');
for(let year=2035;year<2045;year++){
  const nextId=game.run('currentEvent().id');
  assert.ok(!alreadyPlayed.has(nextId),`Legacy journal should advance to an unplayed event, got ${nextId}`);
  alreadyPlayed.add(nextId);
  game.run('persist();s=loadSave(s.schoolId)');
  assert.equal(game.run('currentEvent().id'),nextId,'Remaining schedule must survive reload');
  game.run('choose(0);advance()');
}
assert.ok(game.run('s.done&&s.year===2045'));
game.run('s=initial(SCHOOLS[0]);s.year=2045;s.done=true;delete s.eventId;delete s.eventCatalogVersion;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId);render()');
assert.ok(game.run('s.done'),'An old completed save must remain at the ending');
assert.ok(game.nodes.get('eventTitle').textContent.includes('2045'));
// Existing title-only journals remain readable, with no invented evidence association.
game.run("s=initial(SCHOOLS[0]);s.history=[{year:2026,title:'이전 판의 결정'}];render()");
assert.ok(game.nodes.get('history').innerHTML.includes('이전 판의 결정'));

// Forecast browsing renders the neutral model, before any explicit game start or storage write.
const preview=boot();
assert.equal(preview.writes.length,0);
assert.equal(preview.run('s'),null);
const roster=preview.run('SCHOOLS');
const demographics=preview.run('DEMOGRAPHICS');
assert.equal(demographics.populationModelVersion,'municipal-lifecycle-2024-v2');
assert.equal(Object.keys(demographics.regionalForecasts).length,22);
const originalForecasts=preview.run('JSON.stringify(SCHOOLS.map(school=>school.forecast))');
function markedRows(markup,tag,className){
  const pattern=tag==='tr'?'<tr\\b[^>]*>[\\s\\S]*?</tr>':`<${tag}\\b[^>]*>`;
  return [...markup.matchAll(new RegExp(pattern, 'g'))].filter(match=>new RegExp(`class="[^"]*\\b${className}\\b`).test(match[0])).map(match=>{
    const year=Number(match[0].match(/data-year="(\d+)"/)?.[1]);
    const total=Number(match[0].match(/data-total="(\d+)"/)?.[1]);
    assert.ok(Number.isFinite(year)&&Number.isFinite(total),`${className}: displayed data must be finite`);
    if(tag==='tr')assert.ok(match[0].replace(/<[^>]+>/g,'').includes(total.toLocaleString('ko-KR')),`${className}: table text must show its model total`);
    return {year,total,tag:match[0]};
  });
}
for(let i=0;i<roster.length;i++){
  preview.run(`selectSchool(SCHOOLS[${i}].id)`);
  const school=roster[i],markup=preview.nodes.get('forecastPreview').innerHTML;
  const summary=preview.run('baselineSummary(selected)');
  assert.equal(summary.startTotal,school.forecast[0].total);
  assert.equal(summary.endTotal,school.forecast.at(-1).total);
  assert.equal(summary.change,school.forecast.at(-1).total-school.forecast[0].total);
  assert.equal(summary.points.length,20);
  for(const [tag,className,expected] of [['circle','baseline-point',school.forecast],['tr','baseline-annual-row',school.forecast],['tr','baseline-milestone',school.forecast.filter(point=>[2030,2035,2040,2045].includes(point.year))]]){
    const shown=markedRows(markup,tag,className);
    assert.equal(shown.length,expected.length,`${school.name}: ${className} count`);
    shown.forEach((point,j)=>assert.deepEqual({year:point.year,total:point.total},{year:expected[j].year,total:expected[j].total},`${school.name}: ${className} must display actual model values`));
  }
  const region=demographics.regionalForecasts[school.region];
  assert.ok(region,`${school.name}: regional projection metadata is required`);
  const regionalRows=[...markup.matchAll(/<tr\b[^>]*class="[^"]*\bbaseline-region-row\b[^>]*>[\s\S]*?<\/tr>/g)];
  assert.equal(regionalRows.length,3);
  regionalRows.forEach((match,j)=>{
    const year=[2026,2030,2042][j],row=match[0];
    assert.equal(Number(row.match(/data-year="(\d+)"/)?.[1]),year);
    assert.equal(Number(row.match(/data-population="(\d+)"/)?.[1]),region.population[year]);
    assert.equal(Number(row.match(/data-target="(\d+)"/)?.[1]),region.totals[year]);
    assert.equal(Number(row.match(/data-unassigned="(\d+)"/)?.[1]),region.unassignedTotals[year]);
    assert.equal(Number(row.match(/data-school-total="(\d+)"/)?.[1]),region.totals[year]-region.unassignedTotals[year]);
    const text=row.replace(/<[^>]+>/g,'');
    assert.ok(text.includes(region.population[year].toLocaleString('ko-KR'))&&text.includes(region.totals[year].toLocaleString('ko-KR')),'Regional details distinguish resident population and calibrated enrollment target');
  });
  assert.match(markup,/2043[\s\S]*2045[\s\S]*연장/);
  const comparisons=[...markup.matchAll(/<tr\b[^>]*class="[^"]*\bbaseline-share-comparison\b[^>]*>[\s\S]*?<\/tr>/g)];
  assert.equal(comparisons.length,3);
  comparisons.forEach((match,j)=>{
    const year=[2030,2035,2045][j],row=match[0];
    assert.equal(Number(row.match(/data-year="(\d+)"/)?.[1]),year);
    assert.equal(Number(row.match(/data-primary="(\d+)"/)?.[1]),school.forecast.find(point=>point.year===year).total);
    assert.equal(Number(row.match(/data-fixed="(\d+)"/)?.[1]),school.intakeShareFixedPoints.find(point=>point.year===year).total);
  });
  assert.match(markup,/<svg\b[^>]*aria-label="[^"]+"/);
  assert.match(markup,/<title[\s>]/);
  const axis=markup.match(/class="baseline-ylabels"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(axis,'Chart requires a readable vertical axis');
  const axisValues=[...axis.matchAll(/>([\d,.]+)<\/span>/g)].map(match=>Number(match[1].replaceAll(',','')));
  assert.equal(axisValues.length,3);
  assert.ok(axisValues.every(Number.isInteger),'Student count axis labels must be whole numbers');
  assert.equal(axisValues.at(-1),0,'Chart baseline must begin at zero students');
  const chartPoints=markedRows(markup,'circle','baseline-point');
  let priorX=-Infinity;
  for(const point of chartPoints){
    const x=Number(point.tag.match(/cx="([\d.]+)"/)?.[1]),y=Number(point.tag.match(/cy="([\d.]+)"/)?.[1]);
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>priorX&&y>=0&&y<=200,'Twenty annual points must have valid, increasing chart positions');
    priorX=x;
  }
  assert.ok(!/NaN|Infinity/.test(markup));
  const closing=(school.lifecycleChanges||[]).find(change=>change.kind==='closure'&&['approved','effective'].includes(change.status));
  if(closing){
    assert.equal(summary.startTotal,school.base,'Closure cannot rewrite the observed public count');
    summary.points.filter(point=>point.year>=closing.firstZeroForecastYear).forEach(point=>assert.equal(point.total,0));
    assert.ok(markup.includes(closing.effectiveDate),'Preview must disclose the verified date');
  }
}
assert.equal(preview.run('JSON.stringify(SCHOOLS.map(school=>school.forecast))'),originalForecasts,'Preview must not alter the demographic forecast');
assert.equal(preview.writes.length,0,'Browsing all schools must not write saved progress');
assert.equal(preview.run('s'),null,'Browsing must not initialize a game');
for(const [start,end,change,sign] of [[265,165,-100,'decline'],[15,16,1,'increase'],[19,19,0,'stable']]){
  const summary=preview.run(`baselineSummary({...SCHOOLS[0],forecast:SCHOOLS[0].forecast.map(point=>({...point,total:point.year===2026?${start}:point.year===2045?${end}:point.total}))})`);
  assert.equal(summary.change,change);
  assert.ok(Number.isFinite(summary.percent));
  if(sign==='decline'){assert.ok(summary.percent<0);assert.match(summary.changeText,/-|−|감소/)}
  else if(sign==='increase'){assert.ok(summary.percent>0);assert.match(summary.changeText,/\+|증가/)}
  else {assert.equal(summary.percent,0);assert.match(summary.changeText,/0|변화 없|유지/)}
  if(sign==='decline')assert.match(summary.percentText,/-37[.]7%|−37[.]7%/);
  if(sign==='increase')assert.match(summary.percentText,/\+6[.]7%/);
  assert.ok(!/-0(?:[.,]0+)?%/.test(summary.percentText),'Do not display negative zero');
}
const zero=preview.run("(()=>{const school={...SCHOOLS[0],base:0,forecast:SCHOOLS[0].forecast.map(point=>({...point,total:point.year===2045?5:0}))};return {summary:baselineSummary(school),markup:baselinePreviewMarkup(school)}})()");
assert.equal(zero.summary.startTotal,0);
assert.equal(zero.summary.change,5);
assert.equal(zero.summary.percent,null,'A zero base has no defined percentage change');
assert.ok(!/NaN|Infinity/.test(zero.markup));

// An existing 2040 game still opens onto the original baseline and resumes only on explicit start.
const schoolId=roster[0].id,saveKey='gyeongbuk-principal-population-v3:'+schoolId;
const saved=preview.run('(()=>{const state=initial(SCHOOLS[0]);state.year=2040;state.rep=90;state.appeal=20;state.grades=state.grades.map(value=>value*1.3);state.eventId=events[14].id;return JSON.stringify(state)})()');
const savedEntries=[[saveKey,saved],['gyeongbuk-principal-last',schoolId]];
for(const search of ['', '?school='+encodeURIComponent(schoolId)]){
  const returning=boot({savedEntries,search});
  assert.equal(returning.writes.length,0,'Saved/query-preselected preview must be read-only');
  assert.equal(returning.storage.get(saveKey),saved);
  assert.equal(returning.run('s'),null);
  assert.equal(returning.run('baselineSummary(selected).startTotal'),roster[0].base);
  assert.equal(returning.run('baselineSummary(selected).endTotal'),roster[0].forecast.at(-1).total);
  assert.match(returning.nodes.get('start').innerHTML,/2040/);
  returning.run('selectSchool(SCHOOLS[1].id);selectSchool(SCHOOLS[0].id)');
  assert.equal(returning.writes.length,0,'Rapid school changes must not contaminate a saved game');
  assert.equal(returning.storage.get(saveKey),saved);
  returning.nodes.get('start').onclick();
  assert.equal(returning.run('s.year'),2040);
  assert.equal(returning.run('s.rep'),90);
  assert.equal(returning.run('s.appeal'),20);
  assert.equal(returning.run('JSON.stringify(s.grades)'),JSON.stringify(JSON.parse(saved).grades));
  assert.ok(returning.writes.length>0,'Explicit start may persist the resumed game');
  assert.equal(returning.nodes.get('setup').hidden,true);
  assert.equal(returning.nodes.get('game').hidden,false);
}

// Organization choices run independently from annual choices and retain physical students.
for(const endingAction of ['merge','close']){
  const scenario=boot();
  scenario.run('selectSchool(SCHOOLS[0].id);enterGame();s.grades=[2,0,0,1,0,0];s.special=1;s.organization=OrganizationModel.sync(OrganizationModel.initial(),OrganizationModel.assess(s.grades,{special:s.special,year:s.year,school:SCHOOLS[0]},OrganizationPolicy),s.year);render()');
  const academic=scenario.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,points:s.points,eventId:s.eventId,chosen:s.chosen,chosenIndex:s.chosenIndex})');
  scenario.run("organizationAction('apply-combined')");
  assert.equal(scenario.run('s.organization.combinedGroups.length'),1);
  assert.equal(scenario.run('PopulationModel.total(s.grades,s.special)'),4);
  assert.equal(scenario.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,points:s.points,eventId:s.eventId,chosen:s.chosen,chosenIndex:s.chosenIndex})'),academic,'Grouping cannot alter student counts or the annual decision');
  const applied=scenario.run('JSON.stringify(s)');scenario.run("organizationAction('apply-combined')");
  assert.equal(scenario.run('JSON.stringify(s)'),applied,'Repeated organization click cannot apply twice');
  scenario.run(`organizationAction('${endingAction}')`);
  assert.equal(scenario.run('s.organization.ending'),null,'Ending cannot bypass consultation');
  scenario.run("organizationAction('start-consultation');organizationAction('prepare-support')");
  assert.equal(scenario.run('s.organization.consultation.stage'),'consulting','Preparation requires a later year');
  scenario.run("choose(0);advance();organizationAction('prepare-support')");
  assert.equal(scenario.run('s.organization.consultation.stage'),'ready');
  scenario.run(`organizationAction('${endingAction}')`);
  assert.equal(scenario.run('s.organization.ending'),null,'Final approval requires a further year');
  scenario.run('choose(0);advance()');
  const beforeEnding=scenario.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,points:s.points})');
  const lastTotal=scenario.run('PopulationModel.total(s.grades,s.special)');
  scenario.run(`organizationAction('${endingAction}')`);
  assert.equal(scenario.run('s.organization.ending.kind'),endingAction==='merge'?'merged':'closed');
  assert.equal(scenario.run('s.organization.ending.students'),lastTotal);
  assert.equal(scenario.run('s.done'),false,'Early organization ending is distinct from the 2045 ending');
  assert.equal(scenario.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,points:s.points})'),beforeEnding);
  assert.equal(scenario.nodes.get('next').disabled,true);
  const ended=scenario.run('JSON.stringify(s)');scenario.run('choose(0);advance()');
  assert.equal(scenario.run('JSON.stringify(s)'),ended,'A fictional ending freezes further gameplay');
  scenario.run('persist();s=loadSave(s.schoolId);render()');
  assert.equal(scenario.run('s.organization.ending.students'),lastTotal);
  assert.equal(scenario.run('PopulationModel.total(s.grades,s.special)'),lastTotal);
}

// Confirmed operating changes use their own ending and never silently erase game pupils.
const closingSchools=roster.filter(school=>(school.lifecycleChanges||[]).some(change=>change.kind==='closure'&&['approved','effective'].includes(change.status)));
assert.equal(closingSchools.length,10);
for(const school of closingSchools){
  const flow=boot({search:'?school='+encodeURIComponent(school.id)});
  assert.equal(flow.writes.length,0,'Calendar preview must remain read-only');
  flow.nodes.get('start').onclick();
  flow.run('choose(0)');
  const original=JSON.parse(flow.run('JSON.stringify(s)'));
  const before=flow.run('PopulationModel.total(s.grades,s.special)');
  flow.run('advance()');
  const ending=flow.run('s.lifecycle.ending');
  assert.ok(ending,`${school.name}: closure must intercept the first closed year`);
  assert.equal(ending.lastEnrollment,before);
  assert.equal(ending.students,before);
  assert.equal(ending.graduated+ending.transferred,before);
  if(ending.effectiveDate==='2026-09-01')assert.equal(ending.graduated,0);
  else assert.equal(ending.graduated,flow.run(`OrganizationModel.assess(${JSON.stringify(original.grades)},{special:${original.special}},OrganizationPolicy).grades[5]`));
  assert.equal(JSON.stringify(ending.snapshot.grades),JSON.stringify(original.grades));
  assert.equal(JSON.stringify(ending.snapshot.points),JSON.stringify(original.points));
  assert.equal(JSON.stringify(ending.snapshot.history),JSON.stringify(original.history));
  assert.equal(flow.run('s.year'),2027);
  assert.equal(flow.run('PopulationModel.total(s.grades,s.special)'),0);
  assert.equal(flow.run('s.lifecycle.ending.legacyAdjustment'),false);
  assert.equal(flow.run('s.organization.ending'),null,'Real calendar ending must remain separate from fictional organization ending');
  for(const key of ['money','rep','teacher','happy','facilities','appeal'])assert.equal(flow.run(`s.${key}`),original[key],'Closure intercept must precede yearly metric changes');
  assert.equal(flow.run('s.last'),original.last,'Terminal UI copy must not replace the preserved annual narrative');
  assert.match(flow.nodes.get('narrative').textContent,/운영\s*종료|폐교|기록/);
  assert.match(flow.nodes.get('chartNote').textContent,/운영\s*종료/);
  assert.match(flow.nodes.get('studentDelta').textContent,/운영\s*종료/);
  assert.equal(flow.nodes.get('next').disabled,true);
  const ended=flow.run('JSON.stringify(s)');flow.run("choose(1);advance();organizationAction('start-consultation')");
  assert.equal(flow.run('JSON.stringify(s)'),ended,'Calendar ending freezes all game actions');
  flow.run('persist();s=loadSave(s.schoolId);render()');
  assert.equal(flow.run('s.lifecycle.ending.lastEnrollment'),before);
  assert.equal(flow.run('PopulationModel.total(s.grades,s.special)'),0);
}
const legacyClosed=closingSchools[0];
const legacyCalendar=preview.run(`(()=>{const school=schoolMap.get(${JSON.stringify(legacyClosed.id)}),state=initial(school);state.year=2030;state.grades=[1,2,3,4,5,6];state.special=2;state.history=[{year:2029,title:'이전 모형의 가상 결정'}];state.points=Array.from({length:5},(_,i)=>({year:2026+i,total:i===0?school.base:25-i}));delete state.lifecycle;return JSON.stringify(state)})()`);
const calendarKey='gyeongbuk-principal-population-v3:'+legacyClosed.id;
const oldClosing=boot({savedEntries:[[calendarKey,legacyCalendar]],search:'?school='+encodeURIComponent(legacyClosed.id)});
assert.equal(oldClosing.writes.length,0);
assert.equal(oldClosing.storage.get(calendarKey),legacyCalendar,'Reading a legacy closed-school preview cannot write migration');
oldClosing.nodes.get('start').onclick();
assert.equal(oldClosing.run('s.year'),2030,'Legacy reconciliation must not rewind the saved year');
assert.equal(oldClosing.run('s.lifecycle.ending.legacyAdjustment'),true);
assert.equal(oldClosing.run('s.lifecycle.ending.graduated'),null,'Legacy snapshots cannot assert historical graduation counts');
assert.equal(oldClosing.run('s.lifecycle.ending.lastEnrollment'),23);
assert.equal(oldClosing.run('s.lifecycle.ending.transferred'),23);
assert.equal(oldClosing.run('JSON.stringify(s.lifecycle.ending.snapshot.points)'),JSON.stringify(JSON.parse(legacyCalendar).points));
assert.equal(oldClosing.run('JSON.stringify(s.history)'),JSON.stringify(JSON.parse(legacyCalendar).history));
assert.ok(oldClosing.run('s.points.filter(point=>point.year>=2027).every(point=>point.total===0)'));
const savedEnding=oldClosing.run('JSON.stringify(s.lifecycle.ending)');oldClosing.run('persist();s=loadSave(s.schoolId);render()');
assert.equal(oldClosing.run('JSON.stringify(s.lifecycle.ending)'),savedEnding,'Reload cannot duplicate or replace the preserved snapshot');
console.log(JSON.stringify({status:'passed',events:catalogue.length,choices:catalogue.length*3,sources:Object.keys(sources).length,fullPlaythroughs:3,legacySaveCases:38,legacyJournalContinuation:true,legacyEnding:true,baselineSchools:roster.length,baselineYears:20,previewStorageIsolation:true,organizationEndings:2,calendarClosures:closingSchools.length,legacyCalendarReconciliation:true,endingYear:2045},null,2));
