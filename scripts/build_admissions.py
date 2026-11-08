"""Scale each school's gross 2026 admissions by its municipal age-six ratio.

Independent rounding is an arithmetic scenario, not an official admission plan.
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


def model(base_year, end_year, apply_calendar=True):
    schools = {}
    grouped = collections.defaultdict(list)
    for code, row in annual[base_year].items():
        changes = [change for change in calendar['changes'] if change['schoolCode'] == code and change['kind'] == 'closure' and change['status'] in ('approved', 'effective')]
        closure_year = min((change['firstZeroForecastYear'] for change in changes), default=None) if apply_calendar else None
        school = {**row, 'closureYear': closure_year, 'values': {base_year: row['total']}, 'factors': {base_year: 1}, 'unrounded': {base_year: row['total']}}
        schools[code] = school
        grouped[row['region']].append(school)
    regions = {}
    for region, items in grouped.items():
        items.sort(key=lambda school: school['code'])
        base_total = sum(school['total'] for school in items)
        regions[region] = {'totals': {}, 'unassignedTotals': {}, 'activeSchoolTotals': {}, 'excludedClosureShare': {}, 'roundingAdjustment': {}, 'commonFactors': {}, 'population': {}, 'activeSchoolCount': {}, 'closedSchoolCount': {}}
        assert age_six(region, base_year) > 0
        for year in range(base_year, end_year + 1):
            factor = age_six(region, year) / age_six(region, base_year)
            target = rounded(base_total * factor)
            active = excluded = closed_count = 0
            for school in items:
                raw_total = school['total'] * factor
                independent_total = rounded(raw_total)
                closed = year > base_year and school['closureYear'] is not None and year >= school['closureYear']
                school['values'][year] = 0 if closed else independent_total
                school['factors'][year] = factor
                school['unrounded'][year] = raw_total
                active += school['values'][year]
                excluded += independent_total if closed else 0
                closed_count += int(closed)
            meta = regions[region]
            meta['totals'][year] = target
            meta['activeSchoolTotals'][year] = active
            meta['unassignedTotals'][year] = meta['excludedClosureShare'][year] = excluded
            meta['roundingAdjustment'][year] = target - active - excluded
            meta['commonFactors'][year] = factor
            meta['population'][year] = age_six(region, year)
            meta['closedSchoolCount'][year] = closed_count
            meta['activeSchoolCount'][year] = len(items) - closed_count
    return schools, regions


primary, regions = model(2026, 2045)
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
    'targetYear': 2026, 'inputYears': [2025], 'referenceYears': [2024], 'matchedSchools': len(matched),
    'newSchools': len(set(annual[2026]) - set(retrospective)),
    'absentSchools': len(set(retrospective) - set(annual[2026])),
    'mae': round(statistics.mean(errors), 3), 'medianAbsoluteError': statistics.median(errors),
    'wape': round(sum(errors) / sum(annual[2026][code]['total'] for code in matched), 5),
    'previousYearConstantMae': round(statistics.mean(constant_errors), 3),
    'previousYearConstantMedianAbsoluteError': statistics.median(constant_errors),
    'previousYearConstantWape': round(sum(constant_errors) / sum(annual[2026][code]['total'] for code in matched), 5),
    'note': '2025년 실제 입학일 입학생 수에 시군 6세 거주인구의 2025→2026년 비율을 적용한 한 해 회고 점검입니다. 2026년 실측은 오차 비교에만 사용하며 2024년 관측은 참고 이력입니다. 장기 정확도·신뢰구간이나 미래 학생 배치, 비교 기준보다 우수함을 입증하지 않습니다.'
}
result = {
    'version': 1, 'modelVersion': 'municipal-common-factor-v3', 'checked': '2026-11-08', 'observedYears': list(YEARS), 'forecastEndYear': 2045,
    'source': {
        'title': '학교알리미 2024·2025·2026년 입학생 현황 공시',
        'url': 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l2.do',
        'definition': '최초 입학일 당시 실제 입학한 학생 수',
        'referenceNote': '공시연도별 입학생 현황을 사용합니다. 4월 1일 기준 1학년 재학생 수와 집계 정의·시점이 다릅니다. 두 공시의 차이만으로 전학이나 차이의 원인을 단정하지 않습니다.',
        'populationTitle': municipal.get('title', '경상북도 시군 장래인구추계(2022~2042년)'),
        'populationUrl': municipal.get('source', 'https://www.gb.go.kr/Sub/open_contents/section/datastat/page.do?BD_CODE=gb_statboard&B_STEP=260419700&cmd=2&mnu_uid=7866')
    },
    'method': '학교별 미래 입학생 = 해당 학교의 2026년 실제 입학일 입학생 × 해당 시군의 그해 6세 거주인구 / 해당 시군의 2026년 6세 거주인구를 각각 독립 사사오입합니다. 같은 시군에는 같은 비율을 적용하며 2024·2025년은 관측 이력으로만 보존하고 추세·가중치·하한·학교 간 재배분을 쓰지 않습니다. 2026년 입학생이 0명인 학교는 미래도 0명입니다. 확인된 폐교 이후는 0명이며 그 학교의 현재 연도 비율상 수요 몫은 제외 몫으로 별도 집계합니다. 이는 실제 전학·미배치 인원이나 원래 학생이 남아 있는 풀이 아닙니다.',
    'roundingMethod': '학교별 예상과 시군 전체 목표는 각각 독립 사사오입합니다. 운영교 합계 + 폐교 제외 몫 + 부호 있는 반올림 조정 = 시군 목표이며 조정액을 학교에 배분하지 않습니다.',
    'assumptions': {
        'primary': '시군 공통 6세 인구 비율 · 학교별 독립 반올림', 'comparison': '동일 계산의 호환 필드',
        'limitations': '2027~2042년은 시군 6세 인구추계에 기반한 교육용 산술 시나리오입니다. 6세 거주인구는 입학 규모 변화의 대리지표이며 입학일의 취학 연령·집계 시점과 정확히 일치하는 입학자 명단이 아닙니다. 재학생 합계는 별도의 6~11세 인구 비율을 사용하므로 입학생 전망과 같은 비율이 아닙니다. 2043~2045년은 시군 2042년 6세 인구를 도 전체 6~11세 인구 변화율로 연장한 별도 가정입니다. 초소규모 학교는 1명 반올림만으로도 큰 비율 변화가 나며 미래 출생·이동·학구·주택·정책에 따라 달라집니다. 공식 입학 계획·장기 정확도·신뢰구간을 뜻하지 않습니다. 게임 정책·또래 전학 사건 및 재학생 수 추계와 구분한 입학일 기준 참고 전망입니다.'
    },
    'coverage': {str(year): {'rawRows': len(tables[year]['rows']), 'usableSchools': len(annual[year]), 'excludedRows': len(tables[year]['rows']) - len(annual[year])} for year in YEARS},
    'validation': validation, 'bySchoolCode': {}, 'regionalForecasts': regions
}
for code, school in primary.items():
    observations = {str(year): annual[year].get(code, {}).get('total') for year in YEARS}
    points = [{'year': year, 'total': observations[str(year)], 'kind': 'observed' if observations[str(year)] is not None else 'missing', 'fixedShare': None, 'closed': False} for year in YEARS]
    points += [{'year': year, 'total': school['values'][year], 'kind': 'modeled', 'fixedShare': school['values'][year], 'closed': school['closureYear'] is not None and year >= school['closureYear'], 'commonFactor': school['factors'][year], 'unroundedTotal': school['unrounded'][year]} for year in range(2027, 2046)]
    result['bySchoolCode'][code] = {'code': code, 'name': school['name'], 'region': school['region'], 'observed': observations, 'points': points, 'annualShareTrend': 0}

(ROOT / 'dist/admissions.js').write_text('/* Entrance-day admissions: public observations and illustrative forecasts. */\nconst ADMISSIONS = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8', newline='\n')
print(json.dumps({'schools': len(primary), 'yearsPerSchool': 22, 'admissions2026': sum(school['total'] for school in primary.values()), 'validation': validation}, ensure_ascii=True))
