'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require('../dist/simulation.js');
const read=name=>fs.readFileSync(require.resolve(name),'utf8');
const {schools,metadata}=vm.runInNewContext(read('../dist/schools.js')+'\n({schools:SCHOOLS,metadata:DEMOGRAPHICS});');
const province=JSON.parse(read('../data/source/province-projection.json'));
const municipal=JSON.parse(read('../data/source/municipal-projection.json'));
const calendar=JSON.parse(read('../data/source/school-calendar.json'));
const source=Object.fromEntries([2024,2025,2026].map(year=>[year,JSON.parse(read(`../data/source/school-students-${year}.json`)).list]));
const historical=Object.fromEntries(Object.entries(source).map(([year,rows])=>[year,new Map(rows.map(row=>[row.SCHUL_CODE,row]))]));
const sum=values=>values.reduce((a,b)=>a+b,0),round=value=>Math.floor(value+.5);
const area=row=>row.ADRCD_NM.split(' ')[1].slice(0,-1);
const population=(region,year)=>year<=2042?municipal.regions[region].age6to11[year]:municipal.regions[region].age6to11[2042]*province.values[year]/province.values[2042];
const closed=(school,year)=>calendar.changes.some(change=>change.schoolCode===school.code&&change.kind==='closure'&&['approved','effective'].includes(change.status)&&year>=change.firstZeroForecastYear);
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12,`${label}: ${actual} != ${expected}`);
function components(school,total,offset){
  if(!school.base||!total)return [0,0,0,0,0,0,0];
  const weights=Array.from({length:6},(_,i)=>school.grades[((i-offset)%6+6)%6]).concat(school.special);
  const raw=weights.map(value=>value/school.base*total),counts=raw.map(Math.floor);
  const order=raw.map((value,i)=>({i,fraction:value-counts[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
  for(const {i} of order.slice(0,total-sum(counts)))counts[i]++;
  return counts;
}
assert.equal(metadata.populationModelVersion,'municipal-common-factor-v3');
assert.equal(metadata.regionProjection.officialEndYear,2042);
assert.equal(metadata.regionProjection.extension.startYear,2043);
assert.equal(metadata.regionProjection.extension.endYear,2045);
assert.equal(metadata.officialSchoolForecast,false);
assert.ok(metadata.roundingMethod.includes('독립')||metadata.roundingMethod.includes('각각'));
assert.ok(metadata.method.includes('재배분')&&metadata.method.includes('게임용'));
assert.equal(schools.length,474);assert.equal(new Set(schools.map(s=>s.id)).size,474);
assert.equal(sum(schools.map(s=>s.base)),101176);
const regions=[...new Set(schools.map(s=>s.region))];assert.equal(regions.length,22);assert.ok(!regions.includes('군위'));
assert.equal(Object.keys(municipal.regions).length,24);
const byCode=new Map(schools.map(s=>[s.code,s]));
assert.equal(calendar.changes.filter(c=>c.kind==='closure').length,10);
for(const change of calendar.changes){
  const school=byCode.get(change.schoolCode);assert.ok(school);
  assert.equal(change.schoolName,school.name);assert.equal(change.region,school.region);
  assert.ok(change.sourceIds.every(id=>calendar.sources[id]));
  if(change.kind!=='closure')assert.equal(!!school.forecast[1].closed,false,'Renaming/affiliation/branch status cannot close a school');
}
let pointChecks=0,regionalChecks=0,closureChecks=0,reboundChecks=0,maxAbsRounding=0;
const yearly=[];
for(const school of schools){
  const row=historical[2026].get(school.code);assert.ok(row);
  assert.equal(school.name,row.SCHUL_NM);assert.equal(school.region,area(row));
  assert.equal(school.base,Number(row.COL_S_SUM));
  const originalGrades=Array.from({length:6},(_,i)=>Number(row[`COL_S${i+1}`]));
  assert.deepEqual(Array.from(school.grades),originalGrades);
  assert.equal(school.special,Number(row.COL_S_SUM)-sum(originalGrades));
  assert.equal(school.retention,1);assert.equal(school.entryLogTrend,0);
  for(const year of [2024,2025,2026])assert.equal(school.history[year],historical[year].has(school.code)?Number(historical[year].get(school.code).COL_S_SUM):undefined);
  assert.equal(school.forecast.length,20);
  for(let year=2026;year<=2045;year++){
    const point=model.forecast(school,year),factor=population(school.region,year)/population(school.region,2026);
    const expectedClosed=year>2026&&closed(school,year),expected=expectedClosed?0:round(school.base*factor);
    assert.equal(point.year,year);assert.equal(point.total,expected,`${school.name} ${year}: independent school rounding`);
    near(point.commonFactor,factor,'Common municipal ratio');near(point.unroundedTotal,school.base*factor,'Unrounded school total');
    assert.equal(!!point.closed,!!expectedClosed);
    assert.ok(point.grades.every(value=>Number.isInteger(value)&&value>=0));
    assert.ok(Number.isInteger(point.special)&&point.special>=0);
    assert.equal(sum(Array.from(point.grades))+point.special,point.total);
    assert.equal(model.total(point.grades,point.special),point.total);
    assert.equal(school.intakeShareFixedPoints[year-2026].total,point.total,'Compatibility path is exactly the same scenario');
    if(year===2026){assert.deepEqual(Array.from(point.grades),originalGrades);assert.equal(point.special,school.special)}
    else{
      assert.deepEqual(Array.from(point.grades).concat(point.special),components(school,point.total,year-2026),'Only within-school game component allocation');
      const prior=model.forecast(school,year-1),neutral=model.transition(prior.grades,prior,point,{admission:0,transfer:0});
      neutral.forEach((value,i)=>near(value,point.grades[i],'Neutral transition follows new reference exactly'));
      near(point.gameRetention,factor/prior.commonFactor,'Common game carry factor');
      if(!prior.total&&point.total&&!expectedClosed)reboundChecks++;
    }
    near(point.gameRecruitmentPotential,expectedClosed?0:sum(originalGrades)/6*factor,'Game-only recruitment compatibility');
    if(!school.base)assert.equal(point.total,0,'A zero-base school gets no generated floor');
    if(expectedClosed){assert.equal(point.total,0);assert.ok(point.grades.every(n=>n===0));assert.equal(point.special,0);closureChecks++}
    pointChecks++;
  }
}
for(let year=2026;year<=2045;year++){
  let allActive=0,allExcluded=0,allAdjustment=0,allTarget=0;
  for(const region of regions){
    const group=schools.filter(s=>s.region===region),meta=metadata.regionalForecasts[region];
    const base=sum(source[2026].filter(row=>area(row)===region).map(row=>Number(row.COL_S_SUM)));
    const factor=population(region,year)/population(region,2026),target=round(base*factor);
    const active=sum(group.map(s=>model.forecast(s,year).total));
    const excluded=sum(group.filter(s=>year>2026&&closed(s,year)).map(s=>round(s.base*factor)));
    const adjustment=target-active-excluded;
    assert.equal(meta.observed2026,base);assert.equal(meta.totals[year],target);
    assert.equal(meta.population[year],population(region,year));assert.equal(meta.commonFactors[year],factor);
    assert.equal(meta.activeSchoolTotals[year],active);assert.equal(meta.excludedClosureShare[year],excluded);assert.equal(meta.unassignedTotals[year],excluded);
    assert.equal(meta.roundingAdjustment[year],adjustment);assert.ok(Number.isInteger(adjustment));
    assert.equal(active+excluded+adjustment,target,'No cross-school redistribution: signed rounding stays separate');
    const closedCount=group.filter(s=>year>2026&&closed(s,year)).length;
    assert.equal(meta.closedSchoolCount[year],closedCount);assert.equal(meta.activeSchoolCount[year],group.length-closedCount);
    for(const key of ['totals','unassignedTotals','activeSchoolTotals','excludedClosureShare','roundingAdjustment'])assert.equal(metadata.intakeShareFixedRegional[region][key][year],meta[key][year]);
    const minimumYear=Array.from({length:17},(_,i)=>2026+i).reduce((best,y)=>population(region,y)<population(region,best)?y:best,2026);
    assert.equal(meta.minimum.year,minimumYear);assert.equal(meta.minimum.population,population(region,minimumYear));
    assert.equal(meta.recovery.population,population(region,2042));
    maxAbsRounding=Math.max(maxAbsRounding,Math.abs(adjustment));
    allActive+=active;allExcluded+=excluded;allAdjustment+=adjustment;allTarget+=target;regionalChecks++;
  }
  yearly.push({year,active:allActive,excluded:allExcluded,rounding:allAdjustment,target:allTarget});
}
assert.equal(pointChecks,9480);assert.equal(regionalChecks,440);assert.equal(closureChecks,190);
assert.deepEqual(yearly.at(-1),{year:2045,active:62411,excluded:36,rounding:6,target:62453});
assert.equal(maxAbsRounding,5);
assert.equal(metadata.regionalForecasts['경산'].roundingAdjustment[2039],5);
// Crossing a rounding boundary may restore a reference count; the game ending is separate.
assert.equal(round(1*.49),0);assert.equal(round(1*.51),1);
const zero={grades:[0,0,0,0,0,0],special:0,gameRecruitmentPotential:10,gameRetention:1};
assert.deepEqual(model.transition(zero.grades,zero,zero,{admission:0,transfer:0}),zero.grades);
const recruited=model.transition(zero.grades,zero,zero,{admission:.2,transfer:0});assert.equal(recruited[0],2);
assert.equal(model.transition(recruited,zero,zero,{admission:0,transfer:0})[1],2);
assert.deepEqual(model.transition(recruited,zero,{...zero,closed:true},{admission:.2,transfer:.01}),zero.grades);
for(const school of schools){
  let good=school.grades.slice(),bad=school.grades.slice();
  for(let year=2027;year<=2045;year++){
    const prior=model.forecast(school,year-1),next=model.forecast(school,year);
    good=model.transition(good,prior,next,{admission:.2,transfer:.01});bad=model.transition(bad,prior,next,{admission:-.2,transfer:-.01});
    assert.ok(sum(good)>=sum(next.grades)-1e-7);assert.ok(sum(bad)<=sum(next.grades)+1e-7);
  }
}
// Recompute the holdout from raw 2025 only; 2026 is comparison truth, not input.
const common=source[2026].filter(row=>historical[2025].has(row.SCHUL_CODE));
const errors=common.map(row=>{const old=historical[2025].get(row.SCHUL_CODE),factor=population(area(old),2026)/population(area(old),2025);return Math.abs(round(Number(old.COL_S_SUM)*factor)-Number(row.COL_S_SUM))});
const naive=common.map(row=>Math.abs(Number(historical[2025].get(row.SCHUL_CODE).COL_S_SUM)-Number(row.COL_S_SUM)));
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2};
const rounded=(value,places)=>Math.round(value*10**places)/10**places,actual=sum(common.map(row=>Number(row.COL_S_SUM)));
assert.deepEqual(Array.from(metadata.validation.trainYears),[2025]);assert.equal(metadata.validation.matchedSchools,471);
assert.equal(metadata.validation.newSchoolIds,source[2026].length-common.length);assert.equal(metadata.validation.absentSchoolIds,source[2025].length-common.length);
assert.equal(metadata.validation.meanAbsoluteError,rounded(sum(errors)/common.length,2));assert.equal(metadata.validation.medianAbsoluteError,median(errors));
assert.equal(metadata.validation.weightedAbsolutePercentageError,rounded(sum(errors)/actual*100,2));
assert.equal(metadata.validation.lastYearCountMeanAbsoluteError,rounded(sum(naive)/common.length,2));assert.equal(metadata.validation.lastYearCountMedianAbsoluteError,median(naive));
assert.equal(metadata.validation.lastYearCountWeightedAbsolutePercentageError,rounded(sum(naive)/actual*100,2));
assert.equal(sum(errors)/common.length,13.800424628450106);
console.log(JSON.stringify({status:'passed',schools:schools.length,pointChecks,regionalChecks,closureChecks,reboundChecks,maxAbsRounding,finalYear:yearly.at(-1),validation:metadata.validation},null,2));
