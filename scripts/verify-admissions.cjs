'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(require.resolve(name),'utf8');
const data=vm.runInNewContext(read('../dist/admissions.js')+'\nADMISSIONS;');
const schools=vm.runInNewContext(read('../dist/schools.js')+'\nSCHOOLS;');
const municipal=JSON.parse(read('../data/source/municipal-projection.json'));
const province=JSON.parse(read('../data/source/province-projection.json'));
const calendar=JSON.parse(read('../data/source/school-calendar.json'));
const observed={};
for(const year of [2024,2025,2026]){
  const table=JSON.parse(read(`../data/source/school-admissions-${year}.json`));
  observed[year]=new Map();
  for(const row of table.rows){
    assert.equal(row.length,24);
    if(row[7]!=='N')continue;
    const total=Number(row[23]);
    assert.ok(Number.isInteger(total)&&total>=0);
    assert.equal(Number(row[21])+Number(row[22]),total);
    assert.equal(Number(row[11])+Number(row[15])+Number(row[19]),total);
    assert.ok(!observed[year].has(row[3]));
    observed[year].set(row[3],{name:row[4],total});
  }
  assert.equal(data.coverage[year].rawRows,table.rows.length);
  assert.equal(data.coverage[year].usableSchools,observed[year].size);
}
assert.equal(data.version,1);
assert.equal(data.forecastEndYear,2045);
assert.equal(Object.keys(data.bySchoolCode).length,474);
assert.equal(new URL(data.source.url).protocol,'https:');
assert.ok(data.source.definition&&data.source.referenceNote&&data.method&&data.assumptions.limitations);
let missingHistorical=0,closureChecks=0;
for(const school of schools){
  const record=data.bySchoolCode[school.code];
  assert.ok(record,school.code);
  assert.equal(record.name,school.name);
  assert.equal(record.region,school.region);
  assert.equal(record.points.length,22);
  for(let index=0;index<22;index++){
    const year=2024+index,point=record.points[index];
    assert.equal(point.year,year);
    if(year<=2026){
      const source=observed[year].get(school.code);
      assert.equal(record.observed[year],source?.total??null);
      assert.equal(point.total,source?.total??null);
      assert.equal(point.kind,source?'observed':'missing');
      if(!source)missingHistorical++;
    }else{
      assert.equal(point.kind,'modeled');
      assert.ok(Number.isInteger(point.total)&&point.total>=0);
      assert.ok(Number.isInteger(point.fixedShare)&&point.fixedShare>=0);
      const closure=calendar.changes.find(change=>change.schoolCode===school.code&&change.kind==='closure'&&['approved','effective'].includes(change.status)&&year>=change.firstZeroForecastYear);
      assert.equal(point.closed,!!closure);
      if(closure){assert.equal(point.total,0);assert.equal(point.fixedShare,0);closureChecks++}
    }
  }
}
assert.ok(missingHistorical>0,'New school histories must preserve unknown records');
const observedTotal=schools.reduce((sum,school)=>sum+data.bySchoolCode[school.code].observed[2026],0);
assert.equal(observedTotal,13154);
let regionalChecks=0;
for(const region of Object.keys(data.regionalForecasts)){
  const group=schools.filter(school=>school.region===region),meta=data.regionalForecasts[region];
  const base=group.reduce((sum,school)=>sum+data.bySchoolCode[school.code].observed[2026],0);
  for(let year=2026;year<=2045;year++){
    const age6=municipal.regions[region].age6;
    const population=year<=2042?age6[year]:age6[2042]*province.values[year]/province.values[2042];
    const target=Math.floor(base*population/age6[2026]+.5);
    const total=group.reduce((sum,school)=>sum+data.bySchoolCode[school.code].points.find(point=>point.year===year).total,0);
    assert.equal(meta.totals[year],target);
    assert.equal(total+meta.unassignedTotals[year],target);
    if(year>2026){
      const fixed=group.reduce((sum,school)=>sum+data.bySchoolCode[school.code].points.find(point=>point.year===year).fixedShare,0);
      assert.equal(fixed+meta.unassignedTotals[year],target,'Fixed-share comparison must reconcile to the same regional target');
    }
    regionalChecks++;
  }
}
assert.equal(regionalChecks,440);
const common=[...observed[2026].keys()].filter(code=>observed[2025].has(code));
assert.equal(data.validation.matchedSchools,common.length);
assert.equal(data.validation.newSchools,observed[2026].size-common.length);
assert.equal(data.validation.absentSchools,observed[2025].size-common.length);
const naive=common.reduce((sum,code)=>sum+Math.abs(observed[2026].get(code).total-observed[2025].get(code).total),0)/common.length;
assert.equal(data.validation.previousYearConstantMae,Math.round(naive*1000)/1000);
assert.ok(data.validation.mae>=0&&data.validation.wape>=0&&data.validation.note);
const nakdong=schools.find(school=>school.name==='낙동초등학교');
assert.equal(nakdong.grades[0],0);
assert.equal(data.bySchoolCode[nakdong.code].observed[2026],2,'Entrance-day admissions are not the enrolled grade-one snapshot');
console.log(JSON.stringify({status:'passed',schools:schools.length,pointsPerSchool:22,admissions2026:observedTotal,missingHistorical,closureChecks,regionalChecks,distinctFromGradeOne:true,validation:data.validation},null,2));
