"""Reconcile illustrative school forecasts to municipal population trends.

Resident population is not enrollment. Placement decisions and housing projects
are not inferred. Source files remain unchanged; the model is reproducible.
"""
from pathlib import Path
import collections
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
annual = {y: json.loads((SOURCE / f'school-students-{y}.json').read_text(encoding='utf8'))['list'] for y in (2024, 2025, 2026)}
province = json.loads((SOURCE / 'province-projection.json').read_text(encoding='utf8'))
municipal = json.loads((SOURCE / 'municipal-projection.json').read_text(encoding='utf8'))
lookup = {y: {x['SCHUL_CODE']: x for x in rows} for y, rows in annual.items()}


def regular(row):
    return sum(float(row.get(f'COL_S{i}', 0)) for i in range(1, 7))


def region(row):
    return row['ADRCD_NM'].split()[1][:-1]


def round_n(v):
    return math.floor(v + .5)


def population(r, year, indicator='age6to11'):
    values = municipal['regions'][r][indicator]
    if year <= 2042:
        return values[str(year)]
    # Official municipal series ends in 2042; this is an explicit extension.
    return values['2042'] * province['values'][str(year)] / province['values']['2042']


def allocate_totals(items, values, target):
    """Largest remainder makes integer school headlines sum to a regional goal."""
    result = [math.floor(v) for v in values]
    remaining = target - sum(result)
    assert 0 <= remaining <= len(items)
    order = sorted(range(len(items)), key=lambda i: (-(values[i] - result[i]), items[i]['id']))
    for i in order[:remaining]:
        result[i] += 1
    assert sum(result) == target
    return result


def build(base_year, end_year):
    schools = []
    for row in annual[base_year]:
        code = row['SCHUL_CODE']
        r = region(row)
        assert r in municipal['regions'] and r != '군위'
        grades = [float(row[f'COL_S{i}']) for i in range(1, 7)]
        total = int(row['COL_S_SUM'])
        assert total == sum(row.get(f'COL_S{i}', 0) for i in range(1, 9))
        special = total - sum(grades)
        numerator = denominator = 0
        for year in range(max(2024, base_year - 2), base_year):
            old, new = lookup[year].get(code), lookup[year + 1].get(code)
            if old and new:
                denominator += sum(float(old[f'COL_S{i}']) for i in range(1, 6))
                numerator += sum(float(new[f'COL_S{i}']) for i in range(2, 7))
        # Fixed model assumptions: shrink noisy school ratios toward one.
        retention = min(1.06, max(.94, (numerator + 200) / (denominator + 200))) if denominator else 1
        entry = weight_sum = 0
        for offset, weight in ((0, .7), (1, .2), (2, .1)):
            observed = lookup.get(base_year - offset, {}).get(code)
            if observed:
                entry += float(observed['COL_S1']) * weight
                weight_sum += weight
        entry = .85 * (entry / weight_sum if weight_sum else grades[0]) + .15 * sum(grades) / 6
        schools.append({
            'id': r + '-' + row['SCHUL_NM'], 'code': code, 'region': r,
            'name': row['SCHUL_NM'], 'address': row['ADRCD_NM'], 'type': row['FOND_SC_CODE'],
            'base': total, 'grades': [int(v) for v in grades], 'special': int(special),
            'history': {str(y): int(lookup[y][code]['COL_S_SUM']) for y in annual if y <= base_year and code in lookup[y]},
            'retention': retention, 'entryWeight': entry,
            'forecast': [{'year': base_year, 'total': total, 'grades': grades, 'special': special}]
        })
    schools.sort(key=lambda s: (s['region'], s['name']))
    groups = collections.defaultdict(list)
    for school in schools:
        groups[school['region']].append(school)
    regional = {}
    for r, items in groups.items():
        base_total = sum(s['base'] for s in items)
        base_regular = sum(sum(s['grades']) for s in items)
        regional[r] = {'observed2026' if base_year == 2026 else 'observedBase': base_total,
                       'regular2026' if base_year == 2026 else 'regularBase': int(base_regular),
                       'special2026' if base_year == 2026 else 'specialBase': int(base_total - base_regular),
                       'population': {str(base_year): population(r, base_year)},
                       'totals': {str(base_year): base_total}}
        for year in range(base_year + 1, end_year + 1):
            t = year - base_year
            target = round_n(base_total * population(r, year) / population(r, base_year))
            target_regular = target * base_regular / base_total if base_total else 0
            # July-1 age6 is a demand indicator, not the March entry cohort.
            entry_factor = population(r, year, 'age6') / population(r, base_year, 'age6')
            raw_grades = [[s['entryWeight'] * entry_factor] +
                          [v * s['retention'] ** math.exp(-t / 5) for v in s['forecast'][-1]['grades'][:5]] for s in items]
            raw_regular = sum(sum(g) for g in raw_grades)
            factor = target_regular / raw_regular if raw_regular else 0
            grades = [[v * factor for v in g] for g in raw_grades]
            special = [s['special'] * target / base_total if base_total else 0 for s in items]
            raw_totals = [sum(g) + other for g, other in zip(grades, special)]
            assert abs(sum(raw_totals) - target) < 1e-7
            totals = allocate_totals(items, raw_totals, target)
            for s, g, other, raw_total, total in zip(items, grades, special, raw_totals, totals):
                # Numerical rounding allocation preserves component proportions.
                scale = total / raw_total if raw_total else 0
                g = [round(v * scale, 5) for v in g]
                other = round(other * scale, 5)
                assert round_n(sum(g) + other) == total
                s['forecast'].append({'year': year, 'total': total, 'grades': g, 'special': other})
            regional[r]['population'][str(year)] = population(r, year)
            regional[r]['totals'][str(year)] = target
    for s in schools:
        s.pop('entryWeight')
    return schools, regional


schools, regional = build(2026, 2045)
assert len(regional) == 22 and len(schools) == 474
# 2026 outcomes are excluded from all 2025 -> 2026 forecast inputs.
hindcast, _ = build(2025, 2026)
predictions = {s['code']: s['forecast'][-1]['total'] for s in hindcast}
matched = [(predictions[c], int(row['COL_S_SUM'])) for c, row in lookup[2026].items() if c in predictions]
errors = sorted(abs(p - a) for p, a in matched)
naive_errors = [abs(int(lookup[2025][c]['COL_S_SUM']) - int(row['COL_S_SUM']))
                for c, row in lookup[2026].items() if c in predictions]
validation = {
    'kind': 'retrospective-one-year-holdout', 'trainYears': [2024, 2025], 'targetYear': 2026,
    'matchedSchools': len(matched), 'newSchoolIds': len(lookup[2026].keys() - predictions.keys()),
    'absentSchoolIds': len(predictions.keys() - lookup[2026].keys()),
    'meanAbsoluteError': round(sum(errors) / len(errors), 2),
    'medianAbsoluteError': errors[len(errors) // 2],
    'weightedAbsolutePercentageError': round(sum(errors) / sum(a for _, a in matched) * 100, 2),
    'lastYearCountMeanAbsoluteError': round(sum(naive_errors) / len(naive_errors), 2),
    'note': '2024·2025년 공시와 2024년 발표 인구추계로 2026년을 계산한 회고 점검. 공통 학교 ID만 비교하며 신설·폐교의 수요 재배치는 예측하지 못함. 장기 정확도나 신뢰구간을 입증하지 않음.'
}
region_projection = {k: municipal[k] for k in ('title', 'publisher', 'published', 'source', 'downloadUrl', 'reportUrl', 'table', 'unit', 'boundaryYear', 'sourceRegions', 'definition', 'limitations')}
region_projection.update({'usedRegions': 22, 'excludedRegions': ['군위군'], 'officialEndYear': 2042,
                         'extension': {'startYear': 2043, 'endYear': 2045,
                                       'method': '2042년 시군별 수준에 통계청 경북 6~11세 추계의 2042년 대비 증감비율을 적용한 자체 연장',
                                       'source': province['source']}})
metadata = {
    'version': 3, 'populationModelVersion': 'municipal-2024-v1', 'observedYear': 2026, 'checked': '2026-11-08',
    'schoolSource': 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
    'schoolSourceTitle': '학교알리미 학년별·학급별 학생수, 2024·2025·2026년 공시',
    'province': province, 'regionProjection': region_projection, 'regionalForecasts': regional,
    'validation': validation, 'schools': len(schools), 'officialSchoolForecast': False,
    'regularTotals': {y: sum(regular(x) for x in rows) for y, rows in annual.items()},
    'method': '시군별 2026년 실제 재학생 합계 × 공식 6~11세 인구추계의 2026년 대비 비율을 지역 목표로 설정. 학교별 학년 진급, 최근 3년 입학생 가중치와 시군 6세 인구 비율, 동일 학교 진급 코호트 증감(200명 보정·0.94~1.06 제한·5년 감쇠)을 결합해 배분. 특수·순회학급은 별도 비중 유지. 최대잔여법으로 학교별 표시 합계를 시군 목표에 일치시킴. 2043~2045년은 2042년 지역 수준을 경북 시도추계 증감비율로 연장한 가정. 통학구역·주택개발·신설·통폐합 미반영. 공식 학교별 학생배치계획이 아님.'
}
(ROOT / 'dist/schools.js').write_text('const SCHOOLS=' + json.dumps(schools, ensure_ascii=False, separators=(',', ':')) + ';\nconst DEMOGRAPHICS=' + json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
print(json.dumps({'schools': len(schools), 'regions': len(regional), 'students2026': sum(s['base'] for s in schools), 'studentForecast2045': sum(s['forecast'][-1]['total'] for s in schools), 'validation': validation}, ensure_ascii=False))
