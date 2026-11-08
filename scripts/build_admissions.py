"""Forecast entrance-day admissions separately from enrolled grade-one pupils.

Retained Schoolinfo public tables are joined by school code. Future numbers are
illustrative allocations of a regional age-six trajectory, not admission plans.
"""
from pathlib import Path
import collections
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
YEARS = (2024, 2025, 2026)
tables = {y: json.loads((SOURCE / f'school-admissions-{y}.json').read_text(encoding='utf8')) for y in YEARS}
municipal = json.loads((SOURCE / 'municipal-projection.json').read_text(encoding='utf8'))
province = json.loads((SOURCE / 'province-projection.json').read_text(encoding='utf8'))
calendar = json.loads((SOURCE / 'school-calendar.json').read_text(encoding='utf8'))


def rounded(value):
    return math.floor(value + .5)


def load_rows(table):
    result = {}
    for cells in table['rows']:
        assert len(cells) == len(table['columns']) == 24
        code, name, area = cells[3], cells[4], cells[2].split()[1][:-1]
        assert code not in result
        if cells[7] != 'N':
            continue
        values = [int(cells[i]) for i in (9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23)]
        assert min(values) >= 0
        assert values[0] + values[1] == values[2]
        assert values[3] + values[4] == values[5]
        assert values[6] + values[7] == values[8]
        assert values[9] + values[10] == values[11] == values[2] + values[5] + values[8]
        assert area in municipal['regions'] and area != '군위'
        result[code] = {'code': code, 'name': name, 'region': area, 'total': values[11]}
    return result


annual = {year: load_rows(table) for year, table in tables.items()}
regional_observed = {year: collections.Counter() for year in YEARS}
for year, rows in annual.items():
    for row in rows.values():
        regional_observed[year][row['region']] += row['total']


def age_six(region, year):
    values = municipal['regions'][region]['age6']
    if year <= 2042:
        return values[str(year)]
    return values['2042'] * province['values'][str(year)] / province['values']['2042']


def share_trend(code, region, base_year):
    observed = [(year, annual[year][code]['total']) for year in YEARS if year <= base_year and code in annual[year]]
    if len(observed) < 2:
        return 0.0
    old_year, old = observed[0]
    new_year, new = observed[-1]
    old_share = (old + .5) / (regional_observed[old_year][region] + .5)
    new_share = (new + .5) / (regional_observed[new_year][region] + .5)
    reliability = sum(value for _, value in observed)
    change = math.log(new_share / old_share) / (new_year - old_year)
    return min(math.log(1.15), max(math.log(.85), change * reliability / (reliability + 30)))


def allocate(codes, weights, target):
    amount = sum(weights)
    if not amount:
        return [0] * len(codes), target
    raw = [weight / amount * target for weight in weights]
    counts = [math.floor(value) for value in raw]
    order = sorted(range(len(codes)), key=lambda index: (-(raw[index] - counts[index]), codes[index]))
    for index in order[:target - sum(counts)]:
        counts[index] += 1
    assert sum(counts) == target
    return counts, 0


def model(base_year, end_year, continue_trend=True, apply_calendar=True):
    schools = {}
    grouped = collections.defaultdict(list)
    for code, row in annual[base_year].items():
        weighted = weight_sum = 0.0
        for offset, weight in ((0, .7), (1, .2), (2, .1)):
            prior = annual.get(base_year - offset, {}).get(code)
            if prior is not None:
                weighted += prior['total'] * weight
                weight_sum += weight
        changes = [change for change in calendar['changes'] if change['schoolCode'] == code and change['kind'] == 'closure' and change['status'] in ('approved', 'effective')]
        closure_year = min((change['firstZeroForecastYear'] for change in changes), default=None) if apply_calendar else None
        school = {**row, 'weight': weighted / weight_sum, 'trend': share_trend(code, row['region'], base_year), 'closureYear': closure_year, 'values': {base_year: row['total']}}
        schools[code] = school
        grouped[row['region']].append(school)
    regions = {}
    for region, items in grouped.items():
        items.sort(key=lambda school: school['code'])
        base_total = sum(school['total'] for school in items)
        regions[region] = {'totals': {base_year: base_total}, 'unassignedTotals': {base_year: 0}}
        for year in range(base_year + 1, end_year + 1):
            target = rounded(base_total * age_six(region, year) / age_six(region, base_year))
            weights = [0 if school['closureYear'] is not None and year >= school['closureYear'] else school['weight'] * math.exp((school['trend'] if continue_trend else 0) * (year - base_year)) for school in items]
            counts, unassigned = allocate([school['code'] for school in items], weights, target)
            for school, count in zip(items, counts):
                school['values'][year] = count
                if school['closureYear'] is not None and year >= school['closureYear']:
                    assert count == 0
            regions[region]['totals'][year] = target
            regions[region]['unassignedTotals'][year] = unassigned
            assert sum(counts) + unassigned == target
    return schools, regions


primary, regions = model(2026, 2045)
fixed, _ = model(2026, 2045, continue_trend=False)
roster = json.loads((SOURCE / 'school-students-2026.json').read_text(encoding='utf8'))['list']
assert set(primary) == {school['SCHUL_CODE'] for school in roster}
for row in roster:
    assert primary[row['SCHUL_CODE']]['name'] == row['SCHUL_NM']

# One-year check uses only prior observations and the already-published population projection.
retrospective, _ = model(2025, 2026, apply_calendar=False)
matched = sorted(set(retrospective) & set(annual[2026]))
errors = [abs(retrospective[code]['values'][2026] - annual[2026][code]['total']) for code in matched]
constant_errors = [abs(annual[2025][code]['total'] - annual[2026][code]['total']) for code in matched]
validation = {
    'targetYear': 2026, 'inputYears': [2024, 2025], 'matchedSchools': len(matched),
    'newSchools': len(set(annual[2026]) - set(retrospective)),
    'absentSchools': len(set(retrospective) - set(annual[2026])),
    'mae': round(statistics.mean(errors), 3), 'medianAbsoluteError': statistics.median(errors),
    'wape': round(sum(errors) / sum(annual[2026][code]['total'] for code in matched), 5),
    'previousYearConstantMae': round(statistics.mean(constant_errors), 3),
    'note': '2024·2025년 입학생 공시만으로 2026년을 계산한 공통 학교의 1년 회고 점검입니다. 장기 정확도·신뢰구간이나 미래 학생 배치를 검증한 결과가 아닙니다.'
}
result = {
    'version': 1, 'checked': '2026-11-08', 'observedYears': list(YEARS), 'forecastEndYear': 2045,
    'source': {
        'title': '학교알리미 2024·2025·2026년 입학생 현황 공시',
        'url': 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
        'definition': '최초 입학일 당시 실제 입학한 학생 수',
        'referenceNote': '공시연도별 입학생 현황을 사용합니다. 4월 1일 기준 1학년 재학생 수와 집계 정의·시점이 다릅니다. 두 공시의 차이만으로 전학이나 차이의 원인을 단정하지 않습니다.',
        'populationTitle': municipal.get('title', '경상북도 시군 장래인구추계(2022~2042년)'),
        'populationUrl': municipal.get('source', 'https://www.gb.go.kr/Sub/open_contents/section/datastat/page.do?BD_CODE=gb_statboard&B_STEP=260419700&cmd=2&mnu_uid=7866')
    },
    'method': '시군별 2026년 공시 입학생 합계에 공식 6세 거주인구의 연도별 비율을 곱해 지역 목표를 설정합니다. 학교별 최근 3년 실제 입학생을 0.7·0.2·0.1로 가중하고, 지역 내 입학생 점유율 추세를 표본 수/(표본 수+30)으로 완화해 연 -15~+15% 범위에서 지속하는 가정으로 배분합니다. 확인된 폐교 이후는 0명이며 남은 학교의 상대 가중치로 지역 목표를 재배분합니다. 이는 확인된 수용학교 배정이 아닙니다. 가중치가 모두 0인 지역의 수요는 배치 미확인 모형 인원으로 별도 집계합니다.',
    'assumptions': {
        'primary': '최근 입학생 점유율 추세 지속', 'comparison': '입학생 점유율 고정',
        'limitations': '2027~2042년은 시군 6세 인구추계에 기반한 자체 모형입니다. 6세 거주인구는 입학 규모 변화의 대리지표이며 입학일의 취학 연령·집계 시점과 정확히 일치하는 입학자 명단이 아닙니다. 2043~2045년은 시군 2042년 6세 인구를 도 전체 6~11세 인구 변화율로 연장한 별도 가정입니다. 미래 출생·이동·학구·주택·정책에 따라 달라지며 먼 미래일수록 불확실합니다. 두 경로는 통계적 신뢰구간이 아니며 어느 쪽의 장기 정확도가 높은지 검증하지 않았습니다. 게임 정책·또래 전학 사건과 실제 재학생 수 추계와는 별도의 입학일 기준 참고 전망입니다.'
    },
    'coverage': {str(year): {'rawRows': len(tables[year]['rows']), 'usableSchools': len(annual[year]), 'excludedRows': len(tables[year]['rows']) - len(annual[year])} for year in YEARS},
    'validation': validation, 'bySchoolCode': {}, 'regionalForecasts': regions
}
for code, school in primary.items():
    observations = {str(year): annual[year].get(code, {}).get('total') for year in YEARS}
    points = [{'year': year, 'total': observations[str(year)], 'kind': 'observed' if observations[str(year)] is not None else 'missing', 'fixedShare': None, 'closed': False} for year in YEARS]
    points += [{'year': year, 'total': school['values'][year], 'kind': 'modeled', 'fixedShare': fixed[code]['values'][year], 'closed': school['closureYear'] is not None and year >= school['closureYear']} for year in range(2027, 2046)]
    result['bySchoolCode'][code] = {'code': code, 'name': school['name'], 'region': school['region'], 'observed': observations, 'points': points, 'annualShareTrend': round(math.expm1(school['trend']), 6)}

(ROOT / 'dist/admissions.js').write_text('/* Entrance-day admissions: public observations and illustrative forecasts. */\nconst ADMISSIONS = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
print(json.dumps({'schools': len(primary), 'yearsPerSchool': 22, 'admissions2026': sum(school['total'] for school in primary.values()), 'validation': validation}, ensure_ascii=True))
