"""Apply one municipal population ratio independently to each school.

Arithmetic teaching scenario: closure shares and rounding are not redistributed.
"""
from pathlib import Path
import collections
import json
import math
import statistics

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
annual = {y: json.loads((SOURCE / f'school-students-{y}.json').read_text(encoding='utf8'))['list'] for y in (2024, 2025, 2026)}
province = json.loads((SOURCE / 'province-projection.json').read_text(encoding='utf8'))
municipal = json.loads((SOURCE / 'municipal-projection.json').read_text(encoding='utf8'))
calendar = json.loads((SOURCE / 'school-calendar.json').read_text(encoding='utf8'))
lookup = {year: {row['SCHUL_CODE']: row for row in rows} for year, rows in annual.items()}


def regular(row):
    return sum(float(row.get(f'COL_S{i}', 0)) for i in range(1, 7))


def region(row):
    return row['ADRCD_NM'].split()[1][:-1]


def round_n(value):
    return math.floor(value + .5)


def population(area, year):
    values = municipal['regions'][area]['age6to11']
    if year <= 2042:
        return values[str(year)]
    return values['2042'] * province['values'][str(year)] / province['values']['2042']


def closure_for(school, year):
    return next((change for change in school['lifecycleChanges']
                 if change['kind'] == 'closure' and change['status'] in ('approved', 'effective')
                 and year >= change['firstZeroForecastYear']), None)


def split_components(school, total, offset):
    """Allocate seven integer components inside one school, never across schools.

    Rotating baseline grade shares is game composition, not actual cohort aging.
    """
    if school['base'] == 0 or total == 0:
        return [0] * 6, 0
    weights = [school['grades'][(index - offset) % 6] for index in range(6)] + [school['special']]
    raw = [weight / school['base'] * total for weight in weights]
    counts = [math.floor(value) for value in raw]
    remaining = total - sum(counts)
    assert 0 <= remaining <= 7
    order = sorted(range(7), key=lambda index: (-(raw[index] - counts[index]), index))
    for index in order[:remaining]:
        counts[index] += 1
    assert sum(counts) == total
    return counts[:6], counts[6]


def build(base_year, end_year, apply_calendar=True):
    schools = []
    for row in annual[base_year]:
        code, area = row['SCHUL_CODE'], region(row)
        assert area in municipal['regions'] and area != '군위'
        grades = [int(row[f'COL_S{i}']) for i in range(1, 7)]
        total = int(row['COL_S_SUM'])
        assert total == sum(row.get(f'COL_S{i}', 0) for i in range(1, 9))
        changes = [change for change in calendar['changes'] if change['schoolCode'] == code] if apply_calendar else []
        schools.append({
            'id': area + '-' + row['SCHUL_NM'], 'code': code, 'region': area,
            'name': row['SCHUL_NM'], 'address': row['ADRCD_NM'], 'type': row['FOND_SC_CODE'],
            'base': total, 'grades': grades, 'special': total - sum(grades),
            'history': {str(year): int(lookup[year][code]['COL_S_SUM']) for year in annual if year <= base_year and code in lookup[year]},
            'retention': 1, 'entryLogTrend': 0, 'lifecycleChanges': changes,
            'forecast': [{'year': base_year, 'total': total, 'grades': grades[:], 'special': total - sum(grades),
                          'commonFactor': 1, 'unroundedTotal': total, 'gameRecruitmentPotential': sum(grades) / 6, 'gameRetention': 1}]
        })
    schools.sort(key=lambda school: (school['region'], school['name']))
    grouped = collections.defaultdict(list)
    for school in schools:
        grouped[school['region']].append(school)
    regional = {}
    for area, items in grouped.items():
        base_total = sum(school['base'] for school in items)
        base_regular = sum(sum(school['grades']) for school in items)
        assert population(area, base_year) > 0
        data = {'observed2026' if base_year == 2026 else 'observedBase': base_total,
                'regular2026' if base_year == 2026 else 'regularBase': base_regular,
                'special2026' if base_year == 2026 else 'specialBase': base_total - base_regular,
                'population': {}, 'commonFactors': {}, 'totals': {}, 'unassignedTotals': {},
                'activeSchoolTotals': {}, 'excludedClosureShare': {}, 'roundingAdjustment': {},
                'activeSchoolCount': {}, 'closedSchoolCount': {}}
        for year in range(base_year, end_year + 1):
            factor = population(area, year) / population(area, base_year)
            target = round_n(base_total * factor)
            active_total = excluded = closed_count = 0
            for school in items:
                raw_total = school['base'] * factor
                independent_total = round_n(raw_total)
                closed = year > base_year and bool(closure_for(school, year))
                total = 0 if closed else independent_total
                active_total += total
                excluded += independent_total if closed else 0
                closed_count += int(closed)
                if year == base_year:
                    continue
                grades, special = split_components(school, total, year - base_year)
                prior_factor = school['forecast'][-1]['commonFactor']
                point = {'year': year, 'total': total, 'grades': grades, 'special': special, 'closed': closed,
                         'commonFactor': factor, 'unroundedTotal': raw_total,
                         'gameRecruitmentPotential': 0 if closed else sum(school['grades']) / 6 * factor,
                         'gameRetention': factor / prior_factor if prior_factor else 1}
                names = [change for change in school['lifecycleChanges'] if change.get('afterName') and year >= int(change['effectiveDate'][:4])]
                if names:
                    point['displayName'] = names[-1]['afterName']
                school['forecast'].append(point)
            key = str(year)
            data['population'][key] = population(area, year)
            data['commonFactors'][key] = factor
            data['totals'][key] = target
            data['activeSchoolTotals'][key] = active_total
            data['unassignedTotals'][key] = data['excludedClosureShare'][key] = excluded
            data['roundingAdjustment'][key] = target - active_total - excluded
            data['closedSchoolCount'][key] = closed_count
            data['activeSchoolCount'][key] = len(items) - closed_count
        minimum_year = min(range(base_year, min(end_year, 2042) + 1), key=lambda year: population(area, year))
        data['minimum'] = {'year': minimum_year, 'population': population(area, minimum_year)}
        data['recovery'] = {'year': 2042, 'population': population(area, 2042), 'change': population(area, 2042) - population(area, minimum_year)}
        regional[area] = data
    return schools, regional


schools, regional = build(2026, 2045)
assert len(regional) == 22 and len(schools) == 474
for school in schools:
    school['intakeShareFixedPoints'] = [{'year': point['year'], 'total': point['total']} for point in school['forecast']]

# Only 2025 stock and the published population ratio enter the holdout formula.
hindcast, _ = build(2025, 2026, apply_calendar=False)
predictions = {school['code']: school['forecast'][-1]['total'] for school in hindcast}
matched = [(predictions[code], int(row['COL_S_SUM'])) for code, row in lookup[2026].items() if code in predictions]
errors = [abs(predicted - actual) for predicted, actual in matched]
constant_errors = [abs(int(lookup[2025][code]['COL_S_SUM']) - int(row['COL_S_SUM'])) for code, row in lookup[2026].items() if code in predictions]
actual_total = sum(actual for _, actual in matched)
validation = {
    'kind': 'retrospective-one-year-holdout', 'trainYears': [2025], 'referenceYears': [2024], 'targetYear': 2026,
    'matchedSchools': len(matched), 'newSchoolIds': len(lookup[2026].keys() - predictions.keys()),
    'absentSchoolIds': len(predictions.keys() - lookup[2026].keys()),
    'meanAbsoluteError': round(statistics.mean(errors), 2), 'medianAbsoluteError': statistics.median(errors),
    'weightedAbsolutePercentageError': round(sum(errors) / actual_total * 100, 2),
    'lastYearCountMeanAbsoluteError': round(statistics.mean(constant_errors), 2),
    'lastYearCountMedianAbsoluteError': statistics.median(constant_errors),
    'lastYearCountWeightedAbsolutePercentageError': round(sum(constant_errors) / actual_total * 100, 2),
    'note': '2025년 공시 재학생 수에 시군 6~11세 인구의 2025→2026년 비율을 적용한 한 해 회고 점검입니다. 2026년 실측은 오차 비교에만 사용하며 2024년 관측은 참고 이력입니다. 공통 학교 ID만 비교하고 신설·폐교의 재배치는 예측하지 않습니다. 장기 정확도·신뢰구간이나 비교 기준보다 우수함을 입증하지 않습니다.'
}
region_projection = {key: municipal[key] for key in ('title', 'publisher', 'published', 'source', 'downloadUrl', 'reportUrl', 'table', 'unit', 'boundaryYear', 'sourceRegions', 'definition', 'limitations')}
region_projection.update({'usedRegions': 22, 'excludedRegions': ['군위군'], 'officialEndYear': 2042,
                          'extension': {'startYear': 2043, 'endYear': 2045,
                                        'method': '2042년 시군별 수준에 통계청 경북 6~11세 추계의 2042년 대비 증감비율을 적용한 자체 연장',
                                        'source': province['source']}})
metadata = {
    'version': 3, 'populationModelVersion': 'municipal-common-factor-v3', 'observedYear': 2026, 'checked': '2026-11-08',
    'schoolSource': 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
    'schoolSourceTitle': '학교알리미 학년별·학급별 학생수, 2024·2025·2026년 공시',
    'province': province, 'regionProjection': region_projection, 'regionalForecasts': regional, 'schoolCalendar': calendar,
    'forecastAssumptions': {'primary': '시군 공통 인구 비율 · 학교별 독립 반올림', 'comparison': '동일 계산의 호환 필드',
                            'note': '학교별 실측 규모에 같은 시군의 인구 비율을 곱하는 교육용 산술 시나리오입니다. 별도의 학교별 추세·재배분·하한을 적용하지 않으며 공식 학교별 학생배치계획이나 장기 정확도를 뜻하지 않습니다.'},
    'roundingMethod': '학교별 예상은 각각 사사오입하고 시군 전체 목표도 별도로 사사오입합니다. 운영교 합계와 폐교 제외 몫을 더한 값의 차이는 부호 있는 반올림 조정으로 표시하며 학교에 배분하지 않습니다. 학년·특수 인원의 최대잔여법은 이미 정한 한 학교의 정수 합계를 나누는 게임 표시 배분에만 사용합니다.',
    'intakeShareFixedRegional': {area: {key: data[key] for key in ('totals', 'unassignedTotals', 'activeSchoolTotals', 'excludedClosureShare', 'roundingAdjustment')} for area, data in regional.items()},
    'validation': validation, 'schools': len(schools), 'officialSchoolForecast': False,
    'regularTotals': {year: sum(regular(row) for row in rows) for year, rows in annual.items()},
    'method': '학교별 미래 재학생 합계 = 2026년 공시 재학생 합계 × 해당 시군의 그해 6~11세 거주인구 / 해당 시군의 2026년 6~11세 거주인구를 학교마다 독립 사사오입합니다. 같은 시군에는 같은 비율을 적용하며 입학생·1학년 점유율 추세, 학교별 진급률, 하한, 학교 간 재배분을 쓰지 않습니다. 확인된 폐교 이후 해당 학교는 0명이며 그 학교의 현재 연도 비율상 수요 몫은 제외 몫으로 별도 집계합니다. 이는 과거 학생을 영구 보존한 풀이나 실제 전학·미배치 인원이 아닙니다. 지역 목표·학교별 반올림 차이는 별도 조정으로 남깁니다. 미래 학년 구성은 2026년 일반학년 비중을 순환 이동하고 특수·순회 비중과 함께 합계에 맞춰 정수 배분한 게임용 구성으로 실제 코호트나 입학일 입학생 전망이 아닙니다. 인구 감소·회복을 그대로 따르며 초소규모 학교는 1명 반올림만으로도 큰 비율 변화가 납니다. 2043~2045년은 별도 자체 연장이고 미확인 일정은 존치 가정입니다. 공식 학교별 학생배치계획이 아닙니다.'
}
(ROOT / 'dist/schools.js').write_text('const SCHOOLS=' + json.dumps(schools, ensure_ascii=False, separators=(',', ':')) + ';\nconst DEMOGRAPHICS=' + json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
print(json.dumps({'schools': len(schools), 'regions': len(regional), 'students2026': sum(school['base'] for school in schools),
                  'studentForecast2045': sum(school['forecast'][-1]['total'] for school in schools),
                  'excludedClosureShare2045': sum(data['excludedClosureShare']['2045'] for data in regional.values()),
                  'roundingAdjustment2045': sum(data['roundingAdjustment']['2045'] for data in regional.values()), 'validation': validation}, ensure_ascii=True))
