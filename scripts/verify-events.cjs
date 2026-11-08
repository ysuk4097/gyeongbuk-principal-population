'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const dist=path.resolve(__dirname,'../dist');
const read=name=>fs.readFileSync(path.join(dist,name),'utf8');

// Native disclosure structure is part of the accessible default workflow.
function indexStructure(html=read('index.html')){
  const root={tag:'root',attrs:{},parent:null},stack=[root],nodes=[];
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)){
    const tag=token[1].toLowerCase();
    if(token[0].startsWith('</')){while(stack.length>1){const node=stack.pop();if(node.tag===tag)break}continue}
    const attrs={};
    for(const attr of token[0].slice(tag.length+1,-1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[attr[1]]=attr[2]??attr[3]??attr[4]??true;
    const node={tag,attrs,parent:stack.at(-1)};nodes.push(node);
    if(!voidTags.has(tag)&&!token[0].endsWith('/>'))stack.push(node);
  }
  return {nodes,byId:id=>nodes.find(node=>node.attrs.id===id),detailsAncestors:node=>{const result=[];for(let parent=node?.parent;parent;parent=parent.parent)if(parent.tag==='details')result.push(parent);return result}};
}
const structure=indexStructure();
for(const id of ['gameDataDetails','operationDetails','metricsDetails']){
  const node=structure.byId(id);
  assert.equal(node?.tag,'details',`${id} must use native keyboard-accessible details`);
  assert.ok(!Object.hasOwn(node.attrs,'open'),`${id} must start collapsed`);
  assert.ok(structure.nodes.some(child=>child.parent===node&&child.tag==='summary'),`${id} needs a direct summary`);
}
for(const [id,parent] of [['currentGrades','gameDataDetails'],['budgetPanel','gameDataDetails'],['organizationPanel','operationDetails'],['history','operationDetails'],['chart','metricsDetails']])assert.ok(structure.detailsAncestors(structure.byId(id)).some(node=>node.attrs.id===parent),`${id} belongs in its secondary disclosure`);
for(const id of ['scene','choices','next','retentionAdvanceHint','retentionPanel','start'])assert.equal(structure.detailsAncestors(structure.byId(id)).length,0,`${id} must remain outside collapsed secondary content`);
assert.ok(read('index.html').indexOf('id="choices"')<read('index.html').indexOf('id="scene"'),'Yearly decision must precede the decorative scene in narrow-screen reading order');
assert.equal(structure.nodes.filter(node=>node.attrs.id==='next').length,1,'There must be one Next action');
let nextWithinDecision=false;
for(let node=structure.byId('next').parent;node;node=node.parent)if(String(node.attrs.class).split(/\s+/).includes('decision-card'))nextWithinDecision=true;
assert.ok(nextWithinDecision,'Next stays with the yearly decision, before the scene');

// Exercise the actual buildless application with a minimal DOM, without a browser dependency.
function boot({savedEntries=[],search=''}={}){
  const nodes=new Map(),storage=new Map(savedEntries),writes=[],scrolls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{id,value:'',hidden:id==='game',disabled:false,innerHTML:'',textContent:'',style:{},className:'',attributes:{},listeners:{},classList:{add(){},remove(){}},addEventListener(type,handler){(this.listeners[type]??=[]).push(handler)},dispatchEvent(event){const next={...event,target:this,currentTarget:this};this['on'+event.type]?.(next);for(const handler of this.listeners[event.type]||[])handler(next)},querySelectorAll(){return []},getBoundingClientRect(){return {width:400,height:155}},getContext(){return null},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null},scrollIntoView(options){scrolls.push({id,options})},get offsetWidth(){return 400}});
    return nodes.get(id);
  };
  const context=vm.createContext({console,URL,URLSearchParams,location:{href:'https://example.com/game/'+search,search},document:{getElementById:element,querySelectorAll(){return []},title:''},window:{scrollTo(){},matchMedia(){return {matches:false}},devicePixelRatio:1},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{writes.push({key:k,value:v});storage.set(k,v)}},addEventListener(){},setTimeout(){return 1},clearTimeout(){},confirm(){return true}});
  for(const name of ['schools.js','admissions.js','events.js','evidence.js','simulation.js','organization-policy.js','organization.js','lifecycle.js','retention-evidence.js','retention.js','learning-evidence.js','learning.js','app.js'])vm.runInContext(read(name),context,{filename:name});
  return {run:source=>vm.runInContext(source,context),nodes,storage,writes,scrolls};
}
const game=boot();
function assertCurrentGrades(instance){
  const assessment=instance.run('organizationAssessment()'),markup=instance.nodes.get('currentGrades').innerHTML;
  const rows=[...markup.matchAll(/<[^>]+class="[^"]*\bcurrent-grade\b[^>]*>/g)].filter(match=>/data-grade="/.test(match[0]));
  assert.equal(rows.length,7,'Current grade distribution must always show six grades and special separately');
  let total=0;
  rows.forEach((match,i)=>{
    assert.equal(match[0].match(/data-grade="([^"]+)"/)?.[1],i<6?String(i+1):'special');
    const value=Number(match[0].match(/data-total="(\d+)"/)?.[1]);
    assert.equal(value,i<6?assessment.grades[i]:assessment.specialCount);total+=value;
  });
  assert.equal(total,instance.run('PopulationModel.total(s.grades,s.special)'));
}
function assertLearningReport(instance,type){
  const markup=instance.nodes.get('learningReport').innerHTML;
  const row=markup.match(/<tr\b[^>]*class="[^"]*\blearning-result-row\b[^>]*>/)?.[0];
  assert.ok(row,'An ending must immediately render its comparison report');
  assert.equal(row.match(/data-endtype="([^"]+)"/)?.[1],type);
  assert.equal(Number(row.match(/data-year="(\d+)"/)?.[1]),instance.run('s.year'));
  assert.equal(Number(row.match(/data-baseline="(\d+)"/)?.[1]),instance.run('PopulationModel.forecast(schoolMap.get(s.schoolId),s.year).total'));
  assert.equal(Number(row.match(/data-game="(\d+)"/)?.[1]),instance.run('PopulationModel.total(s.grades,s.special)'));
  const buttons=[...instance.nodes.get('budgetContent').innerHTML.matchAll(/<button\b[^>]*data-budget-support="[^"]+"[^>]*>/g)];
  assert.equal(buttons.length,3);
  buttons.forEach(button=>assert.match(button[0],/\bdisabled\b/,'Ended games must immediately disable support buttons'));
}
const catalogue=game.run('events');
const sources=game.run('POLICY_SOURCES');
const retentionSources=game.run('RetentionEvidenceSources');
const learningEvidence=game.run('LEARNING_EVIDENCE');
for(const fact of learningEvidence.facts){
  assert.ok(fact.id&&fact.title&&fact.text);
  for(const id of fact.sourceIds)assert.ok(learningEvidence.sources[id],`Unknown learning evidence ${id}`);
}
for(const source of Object.values(learningEvidence.sources)){
  for(const key of ['title','publisher','date','finding','limitations'])assert.ok(source[key]?.trim());
  assert.equal(new URL(source.url).protocol,'https:');
}
for(const source of Object.values(retentionSources)){
  for(const key of ['title','publisher','date','finding','limitations'])assert.ok(source[key]?.trim());
  assert.equal(new URL(source.url).protocol,'https:');
}
for(const id of game.run('RetentionModel.assess(initial(SCHOOLS[0])).sourceIds'))assert.ok(retentionSources[id],`Unknown retention source ${id}`);
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
  game.run(`s=initial(SCHOOLS[0]);s.year=${year};s.chosen=${chosen};s.chosenIndex=${chosen?2:'null'};delete s.eventId;delete s.eventCatalogVersion;delete s.organization;delete s.budget;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId)`);
  assert.ok(game.run('s'),`${year}: legacy save must load`);
  assert.equal(game.run('currentEvent().id'),catalogue[(year-2026)%8].id,`${year}: preserve original current event`);
  assert.equal(game.run('s.chosen'),chosen);
  assert.equal(game.run('s.chosenIndex'),chosen?2:null);
  assert.equal(game.run('s.organization.version'),1,'Pre-organization saves receive default organization state');
  assert.equal(game.run('s.budget.start.year'),year,'Old-save ledger must begin at the saved year');
  assert.equal(game.run('s.budget.start.legacy'),true);
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
game.run(`s=initial(SCHOOLS[0]);s.year=2034;s.grades=PopulationModel.forecast(SCHOOLS[0],2034).grades.slice();s.history=${JSON.stringify(oldJournal)};s.chosen=true;s.chosenIndex=2;s.money=110;s.rep=44;delete s.eventId;delete s.eventCatalogVersion;delete s.budget;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId)`);
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
game.run('s=initial(SCHOOLS[0]);s.year=2045;s.done=true;delete s.eventId;delete s.eventCatalogVersion;delete s.budget;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId);render()');
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
const admissions=preview.run('ADMISSIONS');
const originalAdmissions=preview.run('JSON.stringify(ADMISSIONS)');
assert.equal(admissions.version,1);
assert.equal(admissions.forecastEndYear,2045);
assert.equal(demographics.populationModelVersion,'municipal-lifecycle-2024-v2');
assert.equal(Object.keys(demographics.regionalForecasts).length,22);
const originalForecasts=preview.run('JSON.stringify(SCHOOLS.map(school=>school.forecast))');
const comparedRegions=new Set();
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
  if(i===0){
    const view=indexStructure(markup),details=view.byId('baselineDataDetails');
    assert.equal(details?.tag,'details');
    assert.ok(!Object.hasOwn(details.attrs,'open'),'Additional forecast data starts collapsed');
    const primaryChart=view.nodes.find(node=>node.tag==='svg'&&String(node.attrs.class).split(/\s+/).includes('baseline-svg')&&!String(node.attrs.class).includes('admissions-svg'));
    assert.equal(view.detailsAncestors(primaryChart).length,0,'Simple reference chart stays visible');
    for(const className of ['admissions-row','baseline-annual-row','baseline-milestone']){
      const row=view.nodes.find(node=>String(node.attrs.class).split(/\s+/).includes(className));
      assert.ok(view.detailsAncestors(row).includes(details),`${className} belongs inside the single deeper-data disclosure`);
    }
  }
  const incoming=admissions.bySchoolCode[school.code];
  assert.ok(incoming,`${school.name}: admissions reference must match school code`);
  assert.equal(incoming.code,school.code);
  const admissionsMarkup=preview.run('baselineAdmissionsMarkup(selected)');
  const intakeRows=[...admissionsMarkup.matchAll(/<tr\b[^>]*class="[^"]*\badmissions-row\b[^>]*>[\s\S]*?<\/tr>/g)];
  assert.equal(intakeRows.length,22);
  intakeRows.forEach((match,j)=>{
    const point=incoming.points[j],row=match[0];
    assert.equal(Number(row.match(/data-year="(\d+)"/)?.[1]),2024+j);
    assert.equal(point.year,2024+j);
    assert.equal(row.match(/data-kind="([^"]+)"/)?.[1],point.kind);
    assert.equal(row.match(/data-total="([^"]*)"/)?.[1],point.total===null?'':String(point.total),'Unknown observed admissions must remain missing, never invented zero');
    if(point.total!==null)assert.ok(row.replace(/<[^>]+>/g,'').includes(point.total.toLocaleString('ko-KR')));
  });
  assert.ok(admissionsMarkup.includes('2045'));
  const intakePoints=[...admissionsMarkup.matchAll(/<circle\b[^>]*class="[^"]*\badmissions-point\b[^>]*>/g)];
  assert.equal(intakePoints.length,20);
  intakePoints.forEach((match,j)=>{
    assert.equal(Number(match[0].match(/data-year="(\d+)"/)?.[1]),2026+j);
    assert.equal(Number(match[0].match(/data-total="(\d+)"/)?.[1]),incoming.points[j+2].total);
  });
  const firstZero=school.forecast.find(point=>point.total===0)?.year??null;
  assert.equal(preview.run('baselineZeroEnrollmentYear(selected)'),firstZero);
  const zeroMarker=preview.run('baselineZeroEnrollmentMarkup(selected)');
  if(firstZero!==null&&!preview.run(`LifecycleModel.closureFor(selected,${firstZero},DEMOGRAPHICS.schoolCalendar)`)){
    assert.ok(zeroMarker.includes(String(firstZero))&&zeroMarker.includes('게임'),'Neutral zero marker must disclose its year and game-only meaning');
  }else assert.equal(zeroMarker,'','Official calendar ending takes priority over model-zero marker');
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
  if(!comparedRegions.has(school.region)){
    const otherRegion=Object.keys(demographics.regionalForecasts).find(name=>name!==school.region);
    for(const compare of ['province',otherRegion]){
      const comparison=preview.run(`regionComparisonTableMarkup(selected,${JSON.stringify(compare)})`);
      const rows=[...comparison.matchAll(/<tr\b[^>]*class="[^"]*\bregion-comparison-row\b[^>]*>/g)];
      assert.equal(rows.length,6,'Regional comparison requires three common years for each side');
      for(const match of rows){
        const regionKey=match[0].match(/data-region="([^"]+)"/)?.[1],year=Number(match[0].match(/data-year="(\d+)"/)?.[1]);
        assert.ok([school.region,compare].includes(regionKey));
        assert.ok([2026,2030,2045].includes(year));
        const parts=regionKey==='province'?Object.values(demographics.regionalForecasts):[demographics.regionalForecasts[regionKey]];
        const target=parts.reduce((sum,part)=>sum+(year===2026?part.observed2026:part.totals[year]),0);
        const population=parts.reduce((sum,part)=>sum+part.population[year],0);
        assert.equal(Number(match[0].match(/data-target="([^"]+)"/)?.[1]),target);
        assert.ok(Math.abs(Number(match[0].match(/data-population="([^"]+)"/)?.[1])-population)<1e-6);
      }
    }
    comparedRegions.add(school.region);
  }
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
assert.equal(preview.run('JSON.stringify(ADMISSIONS)'),originalAdmissions,'Admissions browsing must not rewrite the separate reference series');
assert.equal(preview.writes.length,0,'Browsing all schools must not write saved progress');
assert.equal(preview.run('s'),null,'Browsing must not initialize a game');
const nakdong=roster.find(school=>school.name==='낙동초등학교');
assert.ok(nakdong);
assert.equal(nakdong.grades[0],0);
assert.equal(admissions.bySchoolCode[nakdong.code].observed['2026'],2,'Gross admissions and enrolled first grade are separate verified statistics');
const nakdongView=boot({search:'?school='+encodeURIComponent(nakdong.id)});
nakdongView.nodes.get('start').onclick();
const currentNakdong=nakdongView.nodes.get('currentGrades').innerHTML.replace(/<[^>]+>/g,'');
assert.match(currentNakdong,/1학년\s*재학생\s*0명/);
assert.match(currentNakdong,/2026년\s*공시\s*입학생\s*2명/,'Sourced admissions must actually render beside current enrolled first grade');
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
const saved=preview.run('(()=>{const state=initial(SCHOOLS[0]);state.year=2040;state.rep=90;state.appeal=20;state.grades=state.grades.map(value=>value*1.3);state.eventId=events[14].id;delete state.budget;return JSON.stringify(state)})()');
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
  assertLearningReport(scenario,endingAction==='merge'?'manual-merged':'manual-closed');
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
const legacyCalendar=preview.run(`(()=>{const school=schoolMap.get(${JSON.stringify(legacyClosed.id)}),state=initial(school);state.year=2030;state.grades=[1,2,3,4,5,6];state.special=2;state.history=[{year:2029,title:'이전 모형의 가상 결정'}];state.points=Array.from({length:5},(_,i)=>({year:2026+i,total:i===0?school.base:25-i}));delete state.lifecycle;delete state.budget;return JSON.stringify(state)})()`);
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

// Game-only zero closure: natural play reaches zero, freezes immediately, and preserves history.
const natural=boot();
natural.run("selectSchool('의성-금성초등학교가음분교장');enterGame();s.happy=75");
while(natural.run('s.year')<2030){
  assert.ok(natural.run('PopulationModel.total(s.grades,s.special)>0'));
  assert.equal(natural.run('s.organization.ending'),null);
  natural.run('choose(2);advance()');
}
assert.equal(natural.run('PopulationModel.total(s.grades,s.special)'),0);
assert.equal(natural.run('s.organization.ending.kind'),'zero-enrollment');
assert.equal(natural.run('s.organization.ending.reason'),'zero-enrollment');
assert.equal(natural.run('s.organization.ending.gameRule'),true);
assert.equal(natural.run('s.organization.ending.automatic'),true);
assert.equal(natural.run('s.lifecycle.ending'),null,'Game zero rule must not fabricate an official closure');
assert.equal(natural.run('s.done'),false);
assert.equal(natural.run('s.history.length'),4);
assert.equal(natural.run('s.points.at(-1).total'),0);
assertCurrentGrades(natural);
assert.equal(natural.nodes.get('next').disabled,true);
assert.match(natural.nodes.get('organizationEnding').innerHTML,/0명/);
assert.match(natural.nodes.get('chartNote').textContent,/종료/);
assert.equal((natural.nodes.get('yard').innerHTML.match(/class="person"/g)||[]).length,0);
const naturalEnded=natural.run('JSON.stringify(s)');
natural.run("choose(0);advance();organizationAction('start-consultation')");
assert.equal(natural.run('JSON.stringify(s)'),naturalEnded,'No policy can restart an automatic ending');
natural.run('persist();s=loadSave(s.schoolId);render()');
assert.equal(natural.run('JSON.stringify(s)'),naturalEnded,'Reload must preserve a zero ending without duplicate logs');

// Legacy current-zero saves migrate in memory, without deleting their positive prior progress.
for(const endingYear of [2034,2045]){
  const raw=preview.run(`(()=>{const state=initial(SCHOOLS[0]);state.year=${endingYear};state.grades=[0,0,0,0,0,0];state.special=0;state.done=${endingYear===2045};state.last='이전 결정 기록';state.history=[{year:${endingYear-1},title:'보존할 결정'}];state.points=[{year:2026,total:state.base},{year:${endingYear-1},total:7},{year:${endingYear},total:0}];delete state.budget;return JSON.stringify(state)})()`);
  const zeroSave=boot({savedEntries:[[saveKey,raw]],search:'?school='+encodeURIComponent(schoolId)});
  assert.equal(zeroSave.writes.length,0);
  assert.equal(zeroSave.storage.get(saveKey),raw);
  zeroSave.nodes.get('start').onclick();
  assert.equal(zeroSave.run('s.organization.ending.kind'),'zero-enrollment');
  assert.equal(zeroSave.run('s.organization.ending.year'),endingYear);
  assert.equal(zeroSave.run('s.done'),endingYear===2045);
  for(const key of ['year','grades','special','history','points','money','rep','teacher','happy','facilities','appeal','last'])assert.equal(zeroSave.run(`JSON.stringify(s.${key})`),JSON.stringify(JSON.parse(raw)[key]),`Automatic ending must preserve ${key}`);
  assert.equal(zeroSave.nodes.get('next').disabled,true);
  assertCurrentGrades(zeroSave);
  assert.match(zeroSave.nodes.get('narrative').textContent,/0명|종료/);
  assert.match(zeroSave.nodes.get('chartNote').textContent,/종료/);
  const migrated=zeroSave.run('JSON.stringify(s)');zeroSave.run('persist();s=loadSave(s.schoolId);render()');
  assert.equal(zeroSave.run('JSON.stringify(s)'),migrated);
}

// A single special pupil or another occupied grade keeps the school open; yard counts stay exact.
for(const [grades,special] of [[[0,0,0,0,0,0],1],[[0,1,0,0,0,0],0],[[.49,0,0,0,0,0],.01]]){
  const raw=preview.run(`(()=>{const state=initial(SCHOOLS[0]);state.grades=${JSON.stringify(grades)};state.special=${special};return JSON.stringify(state)})()`);
  const one=boot({savedEntries:[[saveKey,raw]],search:'?school='+encodeURIComponent(schoolId)});one.nodes.get('start').onclick();
  assert.equal(one.run('PopulationModel.total(s.grades,s.special)'),1);
  assert.equal(one.run('s.organization.ending'),null);
  assertCurrentGrades(one);
  assert.equal((one.nodes.get('yard').innerHTML.match(/class="person"/g)||[]).length,1);
  one.run('choose(0)');assert.equal(one.run('s.chosen'),true,'One pupil must still allow an annual choice');
}
const officialZeroRaw=preview.run(`(()=>{const state=initial(schoolMap.get(${JSON.stringify(legacyClosed.id)}));state.year=2030;state.grades=[0,0,0,0,0,0];state.special=0;return JSON.stringify(state)})()`);
const officialZero=boot({savedEntries:[[calendarKey,officialZeroRaw]],search:'?school='+encodeURIComponent(legacyClosed.id)});officialZero.nodes.get('start').onclick();
assert.ok(officialZero.run('s.lifecycle.ending'),'Official date must reconcile before game-zero ending');
assert.equal(officialZero.run('s.organization.ending'),null);
assertCurrentGrades(officialZero);

function retentionFixture({happy=60,special=0,grades=[1,0,0,0,0,0]}={}){
  const fixture=boot();
  fixture.run(`selectSchool(SCHOOLS[0].id);enterGame();s.year=2028;s.grades=${JSON.stringify(grades)};s.special=${special};s.happy=${happy};s.money=100;s.chosen=true;s.chosenIndex=0;s.history=[{year:2028,title:'보존할 연간 선택'}];s.points=[{year:2026,total:s.base},{year:2027,total:4},{year:2028,total:PopulationModel.total(s.grades,s.special)}];s.organization=OrganizationModel.initial();s.retention=RetentionModel.sync(RetentionModel.initial(),s);render()`);
  return fixture;
}
// Ignoring the visible risk must be equivalent to the disclosed monitoring choice.
const ignored=retentionFixture(),monitored=retentionFixture();
assert.ok(ignored.run('s.retention.pending'));
assert.match(ignored.nodes.get('retentionContent').innerHTML,/1명/);
const annualJournal=ignored.run('JSON.stringify(s.history)');
ignored.run('advance()');monitored.run("retentionAction('monitor');advance()");
for(const key of ['year','grades','special','money','happy','history','points'])assert.equal(ignored.run(`JSON.stringify(s.${key})`),monitored.run(`JSON.stringify(s.${key})`),'Unresolved advance cannot bypass the monitoring consequence');
assert.equal(ignored.run('s.year'),2028,'Loss-to-zero must stop before the normal year transition');
assert.equal(ignored.run('s.organization.ending.kind'),'zero-enrollment');
assert.equal(ignored.run('s.retention.history.length'),1);
assert.equal(ignored.run('s.retention.history[0].loss'),1);
assert.equal(ignored.run('s.retention.history[0].before'),1);
assert.equal(ignored.run('s.retention.history[0].after'),0);
assert.equal(ignored.run('s.history&&JSON.stringify(s.history)'),annualJournal);
assertCurrentGrades(ignored);
const retainedEnd=ignored.run('JSON.stringify(s)');ignored.run("retentionAction('monitor');advance();choose(1)");
assert.equal(ignored.run('JSON.stringify(s)'),retainedEnd,'Peer outflow cannot apply twice or restart a zero ending');
ignored.run('persist();s=loadSave(s.schoolId);render()');
assert.equal(ignored.run('s.retention.history.length'),1);
assert.equal(ignored.run('s.organization.ending.kind'),'zero-enrollment');

const protectedSpecial=retentionFixture({grades:[1,0,0,0,0,0],special:1});
protectedSpecial.run("retentionAction('monitor')");
assert.equal(protectedSpecial.run('s.special'),1,'Regular-only transfer must preserve special pupils');
assert.equal(protectedSpecial.run('PopulationModel.total(s.grades,s.special)'),1);
assert.equal(protectedSpecial.run('s.organization.ending'),null);
assert.equal(protectedSpecial.run('s.retention.history[0].gradeLosses.reduce((sum,item)=>sum+item.count,0)'),1);
assertCurrentGrades(protectedSpecial);

const supported=retentionFixture({grades:[1,1,0,0,0,0]});
const supportedCount=supported.run('PopulationModel.total(s.grades,s.special)');
supported.run("retentionAction('joint-curriculum')");
assert.equal(supported.run('PopulationModel.total(s.grades,s.special)'),supportedCount);
assert.equal(supported.run('s.money'),88);
assert.equal(supported.run('s.happy'),66);
assert.equal(supported.run('s.retention.history[0].loss'),0);
assertCurrentGrades(supported);

// Opening secondary areas survives unrelated renders; chart redraws on disclosure opening.
const disclosureGame=boot();disclosureGame.run('selectSchool(SCHOOLS[0].id);enterGame()');
for(const id of ['gameDataDetails','operationDetails','metricsDetails'])disclosureGame.run(`$('${id}').open=true`);
disclosureGame.run("choose(0);budgetSupportAction('learning')");
for(const id of ['gameDataDetails','operationDetails','metricsDetails'])assert.equal(disclosureGame.run(`$('${id}').open`),true,`${id} must not close on unrelated policy/support rendering`);
const supportView=indexStructure(disclosureGame.nodes.get('budgetContent').innerHTML);
const supportButtons=supportView.nodes.filter(node=>node.tag==='button'&&Object.hasOwn(node.attrs,'data-budget-support'));
assert.equal(supportButtons.length,3);
supportButtons.forEach(button=>assert.equal(supportView.detailsAncestors(button).length,0,'Support controls require only their single outer disclosure'));
disclosureGame.nodes.get('chart').width=1;
disclosureGame.run("$('metricsDetails').dispatchEvent({type:'toggle'})");
assert.ok(disclosureGame.nodes.get('chart').width>1,'Opening the chart disclosure redraws it at the current width');

const highHappiness=retentionFixture({happy:75});
assert.equal(highHappiness.run('s.retention.pending'),null,'High happiness must suppress the extra event');
assert.equal(highHappiness.run('s.retention.history.filter(entry=>entry.loss>0).length'),0);
const becomesHappy=retentionFixture();
becomesHappy.run('s.happy=75;s.retention=RetentionModel.sync(s.retention,s);render()');
assert.equal(becomesHappy.run('s.retention.pending'),null,'Annual choice raising happiness can cancel pending risk');
assert.equal(becomesHappy.run('PopulationModel.total(s.grades,s.special)'),1);
assertCurrentGrades(becomesHappy);

// Budget decisions commit only once, cannot overspend, and retain old unknown financial history.
function budgetFixture(money,year=2027){
  const fixture=boot();
  fixture.run(`selectSchool(SCHOOLS[0].id);enterGame();s.year=${year};s.money=${money};s.happy=75;s.eventId=events[1].id;s.chosen=false;s.chosenIndex=null;s.history=[];s.points=[{year:2026,total:s.base},{year:${year},total:PopulationModel.total(s.grades,s.special)}];s.retention=RetentionModel.initial();s.budget=BudgetModel.initial(s,{legacy:true});render()`);
  return fixture;
}
function assertBudgetBalances(fixture){
  assert.ok(fixture.run('Math.abs(s.budget.start.balance+s.budget.entries.reduce((sum,entry)=>sum+entry.amount,0)-s.money)<1e-8'),'Recorded budget flows must reconcile exactly to the visible balance');
}
const scarce=budgetFixture(-10);
const beforeRejected=scarce.run('JSON.stringify(s)');scarce.run('choose(0)');
assert.equal(scarce.run('JSON.stringify(s)'),beforeRejected,'Unaffordable choice cannot apply money or other effects');
const beforeGrant=scarce.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,chosen:s.chosen,teacher:s.teacher,happy:s.happy,rep:s.rep,facilities:s.facilities,points:s.points})');
scarce.run("budgetSupportAction('transport')");
assert.equal(scarce.run('s.money'),14);
assert.equal(scarce.run('s.budget.grants.length'),1);
assert.equal(scarce.run('JSON.stringify({grades:s.grades,special:s.special,history:s.history,chosen:s.chosen,teacher:s.teacher,happy:s.happy,rep:s.rep,facilities:s.facilities,points:s.points})'),beforeGrant,'Support only funds the budget, without automatic students or wellbeing gains');
const funded=scarce.run('JSON.stringify(s)');scarce.run("budgetSupportAction('learning');budgetFallbackAction()");
assert.equal(scarce.run('JSON.stringify(s)'),funded,'Duplicate support is blocked and fallback disappears when an ordinary option becomes affordable');
scarce.run('choose(2)');
assert.equal(scarce.run('s.money'),6);
assert.equal(scarce.run('s.budget.entries.filter(entry=>entry.kind===\'policy\').length'),1);
const paid=scarce.run('JSON.stringify(s)');scarce.run('choose(2)');
assert.equal(scarce.run('JSON.stringify(s)'),paid);
assertBudgetBalances(scarce);
scarce.run('advance()');
assert.equal(scarce.run('s.budget.entries.filter(entry=>entry.kind===\'allocation\').length'),1);
assertBudgetBalances(scarce);
const beforeEarlyGrant=scarce.run('s.money');scarce.run("budgetSupportAction('learning')");
assert.equal(scarce.run('s.money'),beforeEarlyGrant,'Support cannot repeat before three years pass');
scarce.run("s.year=2030;budgetSupportAction('learning');s.year=2033;budgetSupportAction('shared-curriculum')");
assert.equal(scarce.run('s.budget.grants.length'),3);
const maxGrants=scarce.run('s.money');scarce.run("s.year=2036;budgetSupportAction('transport')");
assert.equal(scarce.run('s.money'),maxGrants);
scarce.run('persist();s=loadSave(s.schoolId);render()');
assert.equal(scarce.run('s.budget.grants.length'),3);
assertBudgetBalances(scarce);

const noProjects=budgetFixture(-20);
const noProjectMetrics=noProjects.run('JSON.stringify({grades:s.grades,special:s.special,money:s.money,rep:s.rep,happy:s.happy,teacher:s.teacher,facilities:s.facilities,appeal:s.appeal})');
noProjects.run('budgetFallbackAction()');
assert.equal(noProjects.run('s.chosen'),true);
assert.equal(noProjects.run('s.chosenIndex'),null);
assert.equal(noProjects.run('s.history.at(-1).budgetFallback'),true);
assert.equal(noProjects.run('s.budget.entries.at(-1).amount'),0);
assert.equal(noProjects.run('JSON.stringify({grades:s.grades,special:s.special,money:s.money,rep:s.rep,happy:s.happy,teacher:s.teacher,facilities:s.facilities,appeal:s.appeal})'),noProjectMetrics);
const fallbackOnce=noProjects.run('JSON.stringify(s)');noProjects.run('budgetFallbackAction();choose(2)');
assert.equal(noProjects.run('JSON.stringify(s)'),fallbackOnce,'Fallback counts as the one annual decision');
noProjects.run('advance()');
assert.equal(noProjects.run('s.year'),2028,'No-project fallback must allow normal annual progression');
assertBudgetBalances(noProjects);

const cap=budgetFixture(245);
cap.run("budgetSupportAction('learning');s.chosen=true;advance()");
assert.ok(cap.run('s.budget.entries.find(entry=>entry.kind===\'allocation\').amount<0'),'Existing annual cap adjustment must be captured as the actual signed net');
assertBudgetBalances(cap);
for(const stopped of [natural,ignored,officialZero,oldClosing]){
  const unchanged=stopped.run('JSON.stringify(s)');stopped.run("budgetSupportAction('learning')");
  assert.equal(stopped.run('JSON.stringify(s)'),unchanged,'No grant may revive an ended run');
  const report=stopped.run('learningReportMarkup(s)');
  assert.ok(report.includes('추가 정책을 반영하지 않은 기준선'));
  assert.ok(report.includes(String(stopped.run('s.year'))));
}
assert.equal(comparedRegions.size,22);
for(const [instance,type] of [[natural,'automatic-zero'],[ignored,'automatic-zero'],[officialZero,'official-calendar']])assertLearningReport(instance,type);
const normalReport=boot();
normalReport.run('selectSchool(SCHOOLS[0].id);enterGame();s.year=2045;s.done=true;s.grades=PopulationModel.forecast(SCHOOLS[0],2045).grades.slice();s.special=PopulationModel.forecast(SCHOOLS[0],2045).special;s.organization=OrganizationModel.initial();render()');
assertLearningReport(normalReport,'normal');
assert.ok(!normalReport.nodes.get('eventDesc').textContent.includes('종합점수'),'Normal ending must not rate large enrollment as inherent success');
console.log(JSON.stringify({status:'passed',events:catalogue.length,choices:catalogue.length*3,sources:Object.keys(sources).length,fullPlaythroughs:3,legacySaveCases:38,legacyJournalContinuation:true,legacyEnding:true,baselineSchools:roster.length,baselineYears:20,previewStorageIsolation:true,organizationEndings:2,calendarClosures:closingSchools.length,legacyCalendarReconciliation:true,automaticZeroEnding:true,zeroEndingSaveMigration:true,specialPupilStaysOpen:true,officialCalendarPriority:true,retentionDefaultMatchesMonitor:true,happy75SuppressesExtraLoss:true,currentGradeTotalsExact:true,regionalLearningComparisons:comparedRegions.size,budgetAffordability:true,supportLimits:true,ledgerReconciles:true,noProjectFallback:true,allEndingReports:true,endingYear:2045},null,2));
