const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const model=require('../dist/simulation.js');
const schools=vm.runInNewContext(fs.readFileSync(require.resolve('../dist/schools.js'),'utf8')+'\nSCHOOLS;');
const province=JSON.parse(fs.readFileSync(require.resolve('../data/source/province-projection.json')));
assert.equal(schools.length,474);
assert.equal(new Set(schools.map(s=>s.id)).size,474);
assert.equal(schools.reduce((sum,s)=>sum+s.base,0),101176);
const regular2026=schools.reduce((sum,s)=>sum+s.grades.reduce((a,b)=>a+b,0),0);
const yearly=[];
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
  const target=regular2026*province.values[year]/province.values[2026];
  assert.ok(Math.abs(regular-target)<.05,`${year}: ${regular} != ${target}`);
  yearly.push({year,regular:Math.round(regular),target:Math.round(target)});
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
console.log(JSON.stringify({status:'passed',schools:schools.length,years:20,distinctSchoolRatios:ratios.size,provinceReconciliation:yearly,examples:schools.filter(s=>['동해초등학교','황남초등학교','울릉초등학교'].includes(s.name)).map(s=>({school:s.name,region:s.region,observed2026:s.base,model2030:model.forecast(s,2030).total,model2045:model.forecast(s,2045).total}))},null,2));
