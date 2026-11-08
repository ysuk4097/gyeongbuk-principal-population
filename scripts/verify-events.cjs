'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const dist=path.resolve(__dirname,'../dist');
const read=name=>fs.readFileSync(path.join(dist,name),'utf8');

// Exercise the actual buildless application with a minimal DOM, without a browser dependency.
function boot(){
  const nodes=new Map(),storage=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{id,value:'',hidden:id==='game',disabled:false,innerHTML:'',textContent:'',style:{},className:'',classList:{add(){},remove(){}},getBoundingClientRect(){return {width:400,height:155}},getContext(){return null},setAttribute(){},get offsetWidth(){return 400}});
    return nodes.get(id);
  };
  const context=vm.createContext({console,URL,URLSearchParams,location:{href:'https://example.com/game/',search:''},document:{getElementById:element,title:''},window:{scrollTo(){},devicePixelRatio:1},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},setTimeout(){return 1},clearTimeout(){},confirm(){return true}});
  for(const name of ['schools.js','events.js','evidence.js','simulation.js','app.js'])vm.runInContext(read(name),context,{filename:name});
  return {run:source=>vm.runInContext(source,context),nodes,storage};
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
  game.run(`s=initial(SCHOOLS[0]);s.year=${year};s.chosen=${chosen};s.chosenIndex=${chosen?2:'null'};delete s.eventId;delete s.eventCatalogVersion;localStorage.setItem(STORE+s.schoolId,JSON.stringify(s));s=loadSave(s.schoolId)`);
  assert.ok(game.run('s'),`${year}: legacy save must load`);
  assert.equal(game.run('currentEvent().id'),catalogue[(year-2026)%8].id,`${year}: preserve original current event`);
  assert.equal(game.run('s.chosen'),chosen);
  assert.equal(game.run('s.chosenIndex'),chosen?2:null);
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
console.log(JSON.stringify({status:'passed',events:catalogue.length,choices:catalogue.length*3,sources:Object.keys(sources).length,fullPlaythroughs:3,legacySaveCases:38,legacyJournalContinuation:true,legacyEnding:true,endingYear:2045},null,2));
