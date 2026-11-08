"""Reconcile illustrative school forecasts to municipal population trends.

Resident population is not enrollment. Only verified school-change dates are
applied. Unknown receiving schools are a separate modeled allocation pool.
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
calendar = json.loads((SOURCE / 'school-calendar.json').read_text(encoding='utf8'))
lookup = {y: {x['SCHUL_CODE']: x for x in rows} for y, rows in annual.items()}
regional_entries = {y: collections.Counter() for y in annual}
for y, rows in annual.items():
    for row in rows:
        regional_entries[y][row['ADRCD_NM'].split()[1][:-1]] += float(row['COL_S1'])


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


def entry_trend(code, r, base_year):
    """An explicit extrapolation of recent relative intake, not a policy effect.

    The pseudocount is used only to estimate a log trend; it never generates
    entrants for a school whose observed intake score is zero.
    """
    observed = [(y, lookup[y][code]) for y in range(max(2024, base_year - 2), base_year + 1) if code in lookup[y]]
    if len(observed) < 2:
        return 0
    y0, old = observed[0]
    y1, new = observed[-1]
    old_share = (float(old['COL_S1']) + .5) / (regional_entries[y0][r] + .5)
    new_share = (float(new['COL_S1']) + .5) / (regional_entries[y1][r] + .5)
    evidence = sum(float(row['COL_S1']) for _, row in observed)
    trend = math.log(new_share / old_share) / (y1 - y0) * evidence / (evidence + 30)
    return min(math.log(1.15), max(math.log(.85), trend))


def closure_for(school, year):
    return next((c for c in school['lifecycleChanges'] if c['kind'] == 'closure' and year >= c['firstZeroForecastYear']), None)


def build(base_year, end_year, continue_intake_trend=True):
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
        # No minimum generated from existing pupils: zero observed intake stays zero.
        entry = entry / weight_sum if weight_sum else grades[0]
        changes = [c for c in calendar['changes'] if c['schoolCode'] == code] if base_year == 2026 else []
        schools.append({
            'id': r + '-' + row['SCHUL_NM'], 'code': code, 'region': r,
            'name': row['SCHUL_NM'], 'address': row['ADRCD_NM'], 'type': row['FOND_SC_CODE'],
            'base': total, 'grades': [int(v) for v in grades], 'special': int(special),
            'history': {str(y): int(lookup[y][code]['COL_S_SUM']) for y in annual if y <= base_year and code in lookup[y]},
            'retention': retention, 'entryWeight': entry, 'entryLogTrend': entry_trend(code, r, base_year),
            'lifecycleChanges': changes,
            'forecast': [{'year': base_year, 'total': total, 'grades': grades, 'special': special,
                          'gameRecruitmentPotential': sum(grades) / 6, 'gameRetention': retention}]
        })
    schools.sort(key=lambda s: (s['region'], s['name']))
    groups = collections.defaultdict(list)
    for school in schools:
        groups[school['region']].append(school)
    regional = {}
    for r, items in groups.items():
        base_total = sum(s['base'] for s in items)
        base_regular = sum(sum(s['grades']) for s in items)
        pool = {'grades': [0.] * 6, 'specialGrades': [0.] * 6}
        regional[r] = {'observed2026' if base_year == 2026 else 'observedBase': base_total,
                       'regular2026' if base_year == 2026 else 'regularBase': int(base_regular),
                       'special2026' if base_year == 2026 else 'specialBase': int(base_total - base_regular),
                       'population': {str(base_year): population(r, base_year)},
                       'totals': {str(base_year): base_total},
                       'unassignedTotals': {str(base_year): 0},
                       'activeSchoolCount': {str(base_year): len(items)},
                       'closedSchoolCount': {str(base_year): 0}}
        for year in range(base_year + 1, end_year + 1):
            t = year - base_year
            target = round_n(base_total * population(r, year) / population(r, base_year))
            # July-1 age6 is a demand indicator, not the March entry cohort.
            entry_factor = population(r, year, 'age6') / population(r, base_year, 'age6')
            raw_grades, special = [], []
            pool_grades = [0.] + pool['grades'][:5]
            pool_special = [0.] + pool['specialGrades'][:5]
            for s in items:
                prior = s['forecast'][-1]
                closed = closure_for(s, year)
                incoming = 0 if closed else s['entryWeight'] * entry_factor * math.exp(s['entryLogTrend'] * t if continue_intake_trend else 0)
                g = [incoming] + [v * s['retention'] for v in prior['grades'][:5]]
                previous_regular = sum(prior['grades'])
                # No permanent special-pupil floor; exact age distribution is unknown.
                ratio = prior['special'] / previous_regular if previous_regular else (s['special'] / sum(s['grades']) if sum(s['grades']) else 0)
                other = sum(g) * ratio
                raw_grades.append(g)
                special.append(other)
            for i, s in enumerate(items):
                change = closure_for(s, year)
                if not change:
                    continue
                recipients = change.get('recipientCodes', []) if change.get('recipientStatus') == 'verified' else []
                destination = next((j for j, school in enumerate(items) if school['code'] in recipients and not closure_for(school, year)), None)
                if destination is not None:
                    raw_grades[destination] = [a + b for a, b in zip(raw_grades[destination], raw_grades[i])]
                    special[destination] += special[i]
                else:
                    pool_grades = [a + b for a, b in zip(pool_grades, raw_grades[i])]
                    # Spread unknown ages over the five continuing grades, then age out.
                    pool_special = [a + (special[i] / 5 if k else 0) for k, a in enumerate(pool_special)]
                raw_grades[i] = [0.] * 6
                special[i] = 0.
            weights = [sum(g) + other for g, other in zip(raw_grades, special)] + [sum(pool_grades) + sum(pool_special)]
            raw_total_all = sum(weights)
            if not raw_total_all and target:
                # Demand unsupported by current-school cohorts is never assigned to
                # a zero-entry school merely to keep that school operating.
                pool_grades[0] = float(target)
                weights[-1] = float(target)
                raw_total_all = float(target)
            factor = target / raw_total_all if raw_total_all else 0
            grades = [[v * factor for v in g] for g in raw_grades]
            special = [v * factor for v in special]
            pool_grades = [v * factor for v in pool_grades]
            pool_special = [v * factor for v in pool_special]
            raw_totals = [w * factor for w in weights]
            totals = allocate_totals(items + [{'id': r + '-배치학교미확인'}], raw_totals, target)
            for s, g, other, raw_total, total in zip(items, grades, special, raw_totals, totals):
                # Numerical rounding allocation preserves component proportions.
                scale = total / raw_total if raw_total else 0
                g = [round(v * scale, 5) for v in g]
                other = round(other * scale, 5)
                assert round_n(sum(g) + other) == total
                closed = closure_for(s, year)
                if closed:
                    assert total == 0
                point = {'year': year, 'total': total, 'grades': g, 'special': other, 'closed': bool(closed),
                         'gameRecruitmentPotential': 0 if closed else round(sum(s['grades']) / 6 * population(r, year) / population(r, base_year), 5),
                         'gameRetention': s['retention']}
                name_changes = [c for c in s['lifecycleChanges'] if c.get('afterName') and year >= int(c['effectiveDate'][:4])]
                if name_changes:
                    point['displayName'] = name_changes[-1]['afterName']
                s['forecast'].append(point)
            pool_scale = totals[-1] / raw_totals[-1] if raw_totals[-1] else 0
            pool = {'grades': [v * pool_scale for v in pool_grades], 'specialGrades': [v * pool_scale for v in pool_special]}
            regional[r]['population'][str(year)] = population(r, year)
            regional[r]['totals'][str(year)] = target
            regional[r]['unassignedTotals'][str(year)] = totals[-1]
            regional[r]['closedSchoolCount'][str(year)] = sum(bool(closure_for(s, year)) for s in items)
            regional[r]['activeSchoolCount'][str(year)] = len(items) - regional[r]['closedSchoolCount'][str(year)]
        minimum_year = min(range(base_year, min(end_year, 2042) + 1), key=lambda y: population(r, y))
        regional[r]['minimum'] = {'year': minimum_year, 'population': population(r, minimum_year)}
        regional[r]['recovery'] = {'year': 2042, 'population': population(r, 2042), 'change': population(r, 2042) - population(r, minimum_year)}
    for s in schools:
        s.pop('entryWeight')
    return schools, regional


schools, regional = build(2026, 2045)
assert len(regional) == 22 and len(schools) == 474
# A transparent assumption comparison, not a second official projection.
fixed_share, fixed_regional = build(2026, 2045, continue_intake_trend=False)
fixed_by_code = {s['code']: s for s in fixed_share}
for school in schools:
    school['intakeShareFixedPoints'] = [{'year': p['year'], 'total': p['total']} for p in fixed_by_code[school['code']]['forecast']]
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
    'version': 3, 'populationModelVersion': 'municipal-lifecycle-2024-v2', 'observedYear': 2026, 'checked': '2026-11-08',
    'schoolSource': 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
    'schoolSourceTitle': '학교알리미 학년별·학급별 학생수, 2024·2025·2026년 공시',
    'province': province, 'regionProjection': region_projection, 'regionalForecasts': regional, 'schoolCalendar': calendar,
    'forecastAssumptions': {'primary': '최근 학교별 1학년 재학생 점유율 추세 지속', 'comparison': '1학년 재학생 점유율 고정',
                            'note': '두 경로 모두 모형 가정이며 어느 쪽의 장기 정확도가 더 높은지 검증한 것이 아님. 게임은 기본 모형을 사용.'},
    'intakeShareFixedRegional': {r: {'totals': data['totals'], 'unassignedTotals': data['unassignedTotals']} for r, data in fixed_regional.items()},
    'validation': validation, 'schools': len(schools), 'officialSchoolForecast': False,
    'regularTotals': {y: sum(regular(x) for x in rows) for y, rows in annual.items()},
    'method': '시군별 2026년 공시 재학생 합계에 공식 6~11세 인구의 증감 비율을 적용해 지역 목표를 설정. 최근 3년 1학년 재학생 가중치와 시군 6세 인구, 학교별 1학년 재학생 점유율의 보정 추세(관측 1학년 인원/(1학년 인원+30), 연 -15~+15% 제한)를 지속하는 가정으로 배분. 이는 입학일 당시 입학생 수와 다른 지표이며 별도 입학생 전망은 실제 입학생 공시를 사용한다. 기존 학생 평균에서 1학년 인원을 생성하는 하한과 과거 추세를 강제로 없애는 감쇠를 제거. 진급비율은 200명 보정·0.94~1.06 제한. 특수·순회 인원은 일반학년 변화에 연동하며 별도 영구 하한을 두지 않음. 확인된 폐교 일정 이후 학교 인원은 0명, 수용학교 확인 시 해당 학교로, 미확인 시 별도 모형 배치풀로 진급학생을 이동. 배치풀은 졸업에 따라 소멸. 학교합계+배치학교 미확인 모형 인원을 최대잔여법으로 시군 목표와 일치시킴. 공식 추계의 회복 경로를 보장으로 해석할 수 없으며, 2043~2045년은 별도 연장 가정. 일정 미확인 학교는 존치 가정. 공식 학교별 학생배치계획이 아님.'
}
(ROOT / 'dist/schools.js').write_text('const SCHOOLS=' + json.dumps(schools, ensure_ascii=False, separators=(',', ':')) + ';\nconst DEMOGRAPHICS=' + json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
print(json.dumps({'schools': len(schools), 'regions': len(regional), 'students2026': sum(s['base'] for s in schools), 'studentForecast2045': sum(s['forecast'][-1]['total'] for s in schools), 'validation': validation}, ensure_ascii=False))
