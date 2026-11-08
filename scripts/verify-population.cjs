const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const model=require('../dist/simulation.js');
const {schools,metadata}=vm.runInNewContext(fs.readFileSync(require.resolve('../dist/schools.js'),'utf8')+'\n({schools:SCHOOLS,metadata:DEMOGRAPHICS});');
const province=JSON.parse(fs.readFileSync(require.resolve('../data/source/province-projection.json')));
const municipal=JSON.parse(fs.readFileSync(require.resolve('../data/source/municipal-projection.json')));
const source2026=JSON.parse(fs.readFileSync(require.resolve('../data/source/school-students-2026.json'))).list;
const source2025=JSON.parse(fs.readFileSync(require.resolve('../data/source/school-students-2025.json'))).list;
const regions=[...new Set(schools.map(s=>s.region))];
assert.equal(metadata.populationModelVersion,'municipal-2024-v1');
assert.equal(regions.length,22);
assert.equal(Object.keys(municipal.regions).length,24);
assert.ok(!regions.includes('군위'));
assert.equal(municipal.regions['포항'].age6to11[2030],15148);
assert.equal(municipal.regions['경상북도'].age6to11[2026],99671);
assert.equal(metadata.regionProjection.officialEndYear,2042);
assert.equal(schools.length,474);
assert.equal(new Set(schools.map(s=>s.id)).size,474);
assert.equal(schools.reduce((sum,s)=>sum+s.base,0),101176);
const yearly=[];
let regionalChecks=0;
for(let year=2026;year<=2045;year++){
  let regular=0;
  for(const school of schools){
    const f=model.forecast(school,year);
    assert.equal(f.year,year);
    assert.ok(f.grades.every(v=>Number.isFinite(v)&&v>=0));
    assert.ok(f.special>=0&&Number.isFinite(f.special));
    assert.equal(model.total(f.grades,f.special),f.total);
    regular+=f.grades.reduce((a,b)=>a+b,0);
    if(year===2026)assert.equal(f.total,school.base);
    if(year>2026){
      const prior=model.forecast(school,year-1);
      const neutral=model.transition(prior.grades,prior,f,{admission:0,transfer:0});
      neutral.forEach((v,i)=>assert.ok(Math.abs(v-f.grades[i])<1e-8));
    }
  }
  let target=0,schoolTotal=0;
  for(const region of regions){
    const group=schools.filter(s=>s.region===region);
    const observed=source2026.filter(s=>s.ADRCD_NM.split(' ')[1].slice(0,-1)===region).reduce((sum,s)=>sum+Number(s.COL_S_SUM),0);
    const population=municipal.regions[region].age6to11;
    const projected=year<=2042?population[year]:population[2042]*province.values[year]/province.values[2042];
    const expected=Math.floor(observed*projected/population[2026]+.5);
    const actual=group.reduce((sum,s)=>sum+model.forecast(s,year).total,0);
    assert.equal(actual,expected,`${region} ${year}: school headlines must equal regional target`);
    assert.equal(metadata.regionalForecasts[region].observed2026,observed);
    assert.equal(metadata.regionalForecasts[region].totals[year],expected);
    assert.equal(metadata.regionalForecasts[region].population[year],projected);
    target+=expected;schoolTotal+=actual;regionalChecks++;
  }
  yearly.push({year,students:schoolTotal,target,regular:Math.round(regular)});
}
for(const school of schools){
  let good=school.grades.slice(),bad=school.grades.slice();
  for(let year=2027;year<=2045;year++){
    const prior=model.forecast(school,year-1),next=model.forecast(school,year);
    good=model.transition(good,prior,next,{admission:.2,transfer:.01});
    bad=model.transition(bad,prior,next,{admission:-.2,transfer:-.01});
    assert.ok(good.reduce((a,b)=>a+b,0)>=next.grades.reduce((a,b)=>a+b,0)-1e-7);
    assert.ok(bad.reduce((a,b)=>a+b,0)<=next.grades.reduce((a,b)=>a+b,0)+1e-7);
  }
}
const ratios=new Set(schools.map(s=>(model.forecast(s,2030).total/s.base).toFixed(3)));
assert.ok(ratios.size>50,'School forecasts should differ beyond a shared percentage');
// Verify the reference comparator and holdout coverage independently.
const old=new Map(source2025.map(s=>[s.SCHUL_CODE,Number(s.COL_S_SUM)]));
const matched=source2026.filter(s=>old.has(s.SCHUL_CODE));
assert.equal(metadata.validation.matchedSchools,matched.length);
assert.equal(metadata.validation.newSchoolIds,source2026.length-matched.length);
assert.equal(metadata.validation.absentSchoolIds,source2025.length-matched.length);
const naive=matched.reduce((sum,s)=>sum+Math.abs(Number(s.COL_S_SUM)-old.get(s.SCHUL_CODE)),0)/matched.length;
assert.equal(metadata.validation.lastYearCountMeanAbsoluteError,Math.round(naive*100)/100);
assert.ok(metadata.validation.meanAbsoluteError<naive);
console.log(JSON.stringify({status:'passed',schools:schools.length,years:20,regionalChecks,distinctSchoolRatios:ratios.size,regionalReconciliation:yearly,validation:metadata.validation,examples:schools.filter(s=>['동해초등학교','황남초등학교','울릉초등학교'].includes(s.name)).map(s=>({school:s.name,region:s.region,observed2026:s.base,model2030:model.forecast(s,2030).total,model2045:model.forecast(s,2045).total}))},null,2));
