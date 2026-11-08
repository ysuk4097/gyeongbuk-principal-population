"""Build school-specific scenario baselines from public aggregates.

This is an illustrative simulation model, not an official school forecast.
Raw school statistics and the province projection are kept unchanged in data/source.
"""
from pathlib import Path
import json, math, collections

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
annual = {y: json.loads((SOURCE / f'school-students-{y}.json').read_text())['list'] for y in (2024, 2025, 2026)}
province = json.loads((SOURCE / 'province-projection.json').read_text())
lookup = {y: {x['SCHUL_CODE']: x for x in rows} for y, rows in annual.items()}
def clip(v, lo, hi): return min(hi, max(lo, v))
def regular(x): return sum(float(x.get(f'COL_S{i}', 0)) for i in range(1, 7))
def region(x): return x['ADRCD_NM'].split()[1][:-1]
def round_n(v): return math.floor(v + .5)
regions = sorted({region(x) for x in annual[2026]})
groups = {r: [x for x in annual[2026] if region(x) == r] for r in regions}
region_totals = {y: {r: sum(regular(x) for x in rows if region(x) == r) for r in regions} for y, rows in annual.items()}
province_regular = {y: sum(region_totals[y].values()) for y in annual}
region_growth = {}
for r in regions:
    old_share = region_totals[2024][r] / province_regular[2024]
    new_share = region_totals[2026][r] / province_regular[2026]
    region_growth[r] = clip(math.log(new_share / old_share) / 2, -.025, .025)

schools = []
for row in annual[2026]:
    code = row['SCHUL_CODE']; r = region(row)
    grades = [float(row[f'COL_S{i}']) for i in range(1, 7)]
    total = int(row['COL_S_SUM'])
    assert total == sum(row.get(f'COL_S{i}', 0) for i in range(1, 9))
    special = total - sum(grades)
    # Cohort survival/transfer ratio is estimated only between matching school IDs.
    numerator = denominator = 0
    for a, b in ((2024, 2025), (2025, 2026)):
        old, new = lookup[a].get(code), lookup[b].get(code)
        if old and new:
            denominator += sum(float(old[f'COL_S{i}']) for i in range(1, 6))
            numerator += sum(float(new[f'COL_S{i}']) for i in range(2, 7))
    # 200 pupil-cohort observations shrink a small school's noisy ratio toward 1.
    retention = clip((numerator + 200) / (denominator + 200), .94, 1.06) if denominator else 1
    entry = 0
    weight_sum = 0
    for year, weight in ((2026,.7),(2025,.2),(2024,.1)):
        observed = lookup[year].get(code)
        if observed:
            entry += float(observed['COL_S1']) * weight
            weight_sum += weight
    entry = entry / weight_sum if weight_sum else grades[0]
    # Avoid forcing a school with zero current entrants to stay at zero forever.
    entry = .85 * entry + .15 * sum(grades)/6
    schools.append({'id':r+'-'+row['SCHUL_NM'], 'code':code, 'region':r,
      'name':row['SCHUL_NM'], 'address':row['ADRCD_NM'], 'type':row['FOND_SC_CODE'],
      'base':total, 'grades':[int(v) for v in grades], 'special':int(special),
      'history':{str(y):int(lookup[y][code]['COL_S_SUM']) for y in annual if code in lookup[y]},
      'retention':retention, 'entryWeight':entry,
      'forecast':[{'year':2026,'total':total,'grades':grades,'special':special}]})

by_region = {r:[s for s in schools if s['region']==r] for r in regions}
for year in range(2027,2046):
    t=year-2026
    # Observed relative regional trends fade over five years; they are assumptions,
    # not official municipal population projections.
    fade=sum(math.exp(-k/5) for k in range(1,t+1))
    raw={r:region_totals[2026][r]*math.exp(region_growth[r]*fade) for r in regions}
    target_all=province_regular[2026]*province['values'][str(year)]/province['values']['2026']
    target={r:target_all*raw[r]/sum(raw.values()) for r in regions}
    for r, items in by_region.items():
        retained={s['id']:[v*s['retention']**math.exp(-t/5) for v in s['forecast'][-1]['grades'][:5]] for s in items}
        retained_total=sum(sum(v) for v in retained.values())
        # Rare extreme decline: scale retained cohorts if they exceed the target.
        survival=min(1,target[r]/retained_total) if retained_total else 1
        incoming=max(0,target[r]-retained_total)
        weights=sum(s['entryWeight'] for s in items)
        region_factor=target[r]/region_totals[2026][r]
        for s in items:
            entry=incoming*s['entryWeight']/weights if weights else incoming/len(items)
            g=[entry]+[v*survival for v in retained[s['id']]]
            other=s['special']*region_factor
            s['forecast'].append({'year':year,'total':round_n(sum(g)+other),
              'grades':[round(v,5) for v in g], 'special':round(other,5)})
for s in schools:
    s.pop('entryWeight')
schools.sort(key=lambda s:(s['region'],s['name']))
metadata={'version':3,'observedYear':2026,'checked':'2026-11-08',
 'schoolSource':'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
 'schoolSourceTitle':'학교알리미 학년별·학급별 학생수, 2024·2025·2026년 공시',
 'province':province, 'schools':len(schools), 'officialSchoolForecast':False,
 'regularTotals':province_regular,
 'regionTrends':{r:round(v,6) for r,v in region_growth.items()},
 'method':'학년별 진급 + 과거 동일 학교 코호트 이동비율(200명 보정, 0.94~1.06 제한, 5년 감쇠) + 경북 6~11세 중위추계 증감비율. 시군의 2024~2026년 재학생 점유율 추세는 연 ±2.5% 제한 후 5년 감쇠하며 도 합계에 맞춰 재정규화. 신입생은 학교별 최근 3년 입학생 가중치로 배분. 특수·순회학급은 공시 합계를 맞추기 위해 별도 유지 후 시군 기준선 비율로 변화. 천 명 단위 인구를 학교 학생 수로 환산한 모형 결과이며 공식 학교별 학생배치계획이 아님.'}
(ROOT/'dist/schools.js').write_text('const SCHOOLS='+json.dumps(schools,ensure_ascii=False,separators=(',',':'))+';\nconst DEMOGRAPHICS='+json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+';\n')
print(json.dumps({'schools':len(schools),'regions':len(regions),'students2026':sum(s['base'] for s in schools),'studentForecast2045':sum(s['forecast'][-1]['total'] for s in schools)},ensure_ascii=False))
