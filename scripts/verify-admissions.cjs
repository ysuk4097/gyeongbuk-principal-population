'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(require.resolve(name),'utf8');
const data=vm.runInNewContext(read('../dist/admissions.js')+'\nADMISSIONS;');
const schools=vm.runInNewContext(read('../dist/schools.js')+'\nSCHOOLS;');
const municipal=JSON.parse(read('../data/source/municipal-projection.json'));
const province=JSON.parse(read('../data/source/province-projection.json'));
const calendar=JSON.parse(read('../data/source/school-calendar.json'));
const sum=values=>values.reduce((a,b)=>a+b,0),round=value=>Math.floor(value+.5);
const population=(region,year)=>year<=2042?municipal.regions[region].age6[year]:municipal.regions[region].age6[2042]*province.values[year]/province.values[2042];
const closed=(school,year)=>calendar.changes.some(change=>change.schoolCode===school.code&&change.kind==='closure'&&['approved','effective'].includes(change.status)&&year>=change.firstZeroForecastYear);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12);
const observed={};
for(const year of [2024,2025,2026]){
  const table=JSON.parse(read(`../data/source/school-admissions-${year}.json`));observed[year]=new Map();
  for(const row of table.rows){
    assert.equal(row.length,24);if(row[7]!=='N')continue;
    const total=Number(row[23]);assert.ok(Number.isInteger(total)&&total>=0);
    assert.equal(Number(row[21])+Number(row[22]),total);assert.equal(Number(row[11])+Number(row[15])+Number(row[19]),total);
    assert.ok(!observed[year].has(row[3]));observed[year].set(row[3],{name:row[4],region:row[2].split(' ')[1].slice(0,-1),total});
  }
  assert.equal(data.coverage[year].rawRows,table.rows.length);assert.equal(data.coverage[year].usableSchools,observed[year].size);
}
assert.equal(data.version,1);assert.equal(data.modelVersion,'municipal-common-factor-v3');assert.equal(data.forecastEndYear,2045);
assert.equal(Object.keys(data.bySchoolCode).length,474);assert.equal(new URL(data.source.url).protocol,'https:');
assert.ok(data.source.definition&&data.source.referenceNote&&data.method&&data.assumptions.limitations);
assert.ok(data.roundingMethod.includes('각각')&&data.roundingMethod.includes('조정'));
assert.ok(data.assumptions.limitations.includes('6~11세')&&data.assumptions.limitations.includes('2043~2045'));
let missingHistorical=0,closureChecks=0,pointChecks=0,zeroBaseSchools=0;
for(const school of schools){
  const record=data.bySchoolCode[school.code];assert.ok(record,school.code);
  assert.equal(record.name,school.name);assert.equal(record.region,school.region);assert.equal(record.points.length,22);assert.equal(record.annualShareTrend,0);
  const base=observed[2026].get(school.code).total;if(base===0)zeroBaseSchools++;
  for(let index=0;index<22;index++){
    const year=2024+index,point=record.points[index];assert.equal(point.year,year);
    if(year<=2026){
      const source=observed[year].get(school.code);
      assert.equal(record.observed[year],source?.total??null);assert.equal(point.total,source?.total??null);assert.equal(point.kind,source?'observed':'missing');
      assert.equal(point.fixedShare,null);assert.equal(point.closed,false);if(!source)missingHistorical++;
    }else{
      const factor=population(school.region,year)/population(school.region,2026),expectedClosed=closed(school,year);
      assert.equal(point.kind,'modeled');assert.ok(Number.isInteger(point.total)&&point.total>=0);
      assert.equal(point.total,expectedClosed?0:round(base*factor),`${school.name} ${year}: own gross admissions times common age-six factor`);
      assert.equal(point.fixedShare,point.total,'Compatibility series is identical, not another assumption');
      near(point.commonFactor,factor);near(point.unroundedTotal,base*factor);assert.equal(point.closed,expectedClosed);
      if(base===0)assert.equal(point.total,0,'Zero 2026 gross admissions has no generated intake floor');
      if(expectedClosed){assert.equal(point.total,0);closureChecks++}
    }
    pointChecks++;
  }
}
assert.ok(missingHistorical>0);assert.ok(zeroBaseSchools>0);assert.equal(pointChecks,10428);assert.equal(closureChecks,190);
const observedTotal=sum(schools.map(school=>data.bySchoolCode[school.code].observed[2026]));assert.equal(observedTotal,13154);
let regionalChecks=0,distinctAgeFactorChecks=0,maxAbsRounding=0;
for(const region of Object.keys(data.regionalForecasts)){
  const group=schools.filter(school=>school.region===region),meta=data.regionalForecasts[region];
  const base=sum(group.map(school=>data.bySchoolCode[school.code].observed[2026]));
  for(let year=2026;year<=2045;year++){
    const factor=population(region,year)/population(region,2026),target=round(base*factor);
    const active=sum(group.map(school=>data.bySchoolCode[school.code].points[year-2024].total));
    const excluded=sum(group.filter(school=>year>2026&&closed(school,year)).map(school=>round(data.bySchoolCode[school.code].observed[2026]*factor)));
    const adjustment=target-active-excluded;
    assert.equal(meta.totals[year],target);assert.equal(meta.activeSchoolTotals[year],active);
    assert.equal(meta.unassignedTotals[year],excluded);assert.equal(meta.excludedClosureShare[year],excluded);assert.equal(meta.roundingAdjustment[year],adjustment);
    assert.ok(Number.isInteger(adjustment));assert.equal(active+excluded+adjustment,target,'Rounding remains outside school forecasts');
    assert.equal(meta.commonFactors[year],factor);assert.equal(meta.population[year],population(region,year));
    const closedCount=group.filter(school=>year>2026&&closed(school,year)).length;
    assert.equal(meta.closedSchoolCount[year],closedCount);assert.equal(meta.activeSchoolCount[year],group.length-closedCount);
    if(year>2026&&Math.abs(group[0].forecast[year-2026].commonFactor-factor)>1e-8)distinctAgeFactorChecks++;
    maxAbsRounding=Math.max(maxAbsRounding,Math.abs(adjustment));regionalChecks++;
  }
}
assert.equal(regionalChecks,440);assert.ok(distinctAgeFactorChecks>0,'Gross admissions uses age six, not the age-six-to-eleven stock factor');
// Honest one-year check: 2025 gross admissions is the sole enrollment input.
const common=[...observed[2026].keys()].filter(code=>observed[2025].has(code));
const errors=common.map(code=>{const old=observed[2025].get(code),factor=population(old.region,2026)/population(old.region,2025);return Math.abs(round(old.total*factor)-observed[2026].get(code).total)});
const naive=common.map(code=>Math.abs(observed[2025].get(code).total-observed[2026].get(code).total));
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2};
const rounded=(value,places)=>Math.round(value*10**places)/10**places,actual=sum(common.map(code=>observed[2026].get(code).total));
assert.deepEqual(Array.from(data.validation.inputYears),[2025]);assert.equal(data.validation.matchedSchools,470);
assert.equal(data.validation.newSchools,observed[2026].size-common.length);assert.equal(data.validation.absentSchools,observed[2025].size-common.length);
assert.equal(data.validation.mae,rounded(sum(errors)/common.length,3));assert.equal(data.validation.medianAbsoluteError,median(errors));assert.equal(data.validation.wape,rounded(sum(errors)/actual,5));
assert.equal(data.validation.previousYearConstantMae,rounded(sum(naive)/common.length,3));assert.equal(data.validation.previousYearConstantMedianAbsoluteError,median(naive));assert.equal(data.validation.previousYearConstantWape,rounded(sum(naive)/actual,5));
assert.equal(sum(errors)/common.length,5.170212765957447);
const nakdong=schools.find(school=>school.name==='낙동초등학교');assert.equal(nakdong.grades[0],0);assert.equal(data.bySchoolCode[nakdong.code].observed[2026],2);
console.log(JSON.stringify({status:'passed',schools:schools.length,pointChecks,admissions2026:observedTotal,missingHistorical,closureChecks,zeroBaseSchools,regionalChecks,distinctAgeFactorChecks,maxAbsRounding,validation:data.validation},null,2));
