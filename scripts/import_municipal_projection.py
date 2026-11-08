"""Extract unmodified published population facts from the Gyeongbuk XLSX.

No third-party Python packages are required. This reads the workbook without
editing it. Resident population is not enrolled student count.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://www.gb.go.kr/Sub/open_contents/section/datastat/page.do?BD_CODE=gb_statboard&B_STEP=260419700&cmd=2&mnu_uid=7866'
DOWNLOAD = 'https://www.gb.go.kr/invest/Common/board_egov/download.jsp?B_ORDER=1&B_STEP=260419700'
REPORT = 'https://www.gb.go.kr/invest/Common/board_egov/download.jsp?B_ORDER=2&B_STEP=260419700'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xlsx', type=Path, help='Previously downloaded, unchanged official XLSX')
    args = parser.parse_args()
    data = args.xlsx.read_bytes() if args.xlsx else urllib.request.urlopen(DOWNLOAD, timeout=60).read()
    archive = zipfile.ZipFile(io.BytesIO(data))
    strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]

    def rows(number):
        root = ET.fromstring(archive.read(f'xl/worksheets/sheet{number}.xml'))
        for row in root.findall('.//s:sheetData/s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                key = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                value = cell.find('s:v', NS)
                if value is None:
                    continue
                value = value.text
                values[key] = strings[int(value)] if cell.attrib.get('t') == 's' else float(value)
            yield int(row.attrib['r']), values

    years = list(range(2022, 2043))

    def columns(start):
        return [chr(ord('A') + i) for i in range(start, start + len(years))]

    def series(row, start):
        result = {str(y): int(row[c]) for y, c in zip(years, columns(start))}
        assert all(row[c] == result[str(y)] and result[str(y)] >= 0 for y, c in zip(years, columns(start)))
        return result

    regions = {}
    current = None
    for row_no, row in rows(3):
        current = row.get('A') or current
        if row.get('B') == '학령인구(명): 초등학교(6-11세)':
            key = current if current == '경상북도' else current[:-1]
            regions[key] = {'name': current, 'age6to11': series(row, 2), 'sourceRows': {'age6to11': row_no}}

    current = sex = None
    for row_no, row in rows(1):
        current = row.get('A') or current
        sex = row.get('B') or sex
        if sex == '계' and row.get('D') == '6세':
            key = current if current == '경상북도' else current[:-1]
            regions[key]['age6'] = series(row, 4)
            regions[key]['sourceRows']['age6'] = row_no

    assert len(regions) == 24 and all('age6' in r for r in regions.values())
    assert regions['경상북도']['age6to11']['2026'] == 99671
    assert regions['포항']['age6to11']['2030'] == 15148
    result = {
        'title': '경상북도 시군 장래인구추계 결과(2022~2042년)',
        'publisher': '경상북도', 'published': '2024-12-20', 'checked': '2026-11-08',
        'source': PAGE, 'downloadUrl': DOWNLOAD, 'reportUrl': REPORT,
        'originalSha256': hashlib.sha256(data).hexdigest(),
        'table': '주요연령계층별: 초등학교(6-11세); 1세별: 계·6세',
        'unit': '명', 'boundaryYear': 2022, 'sourceRegions': 23,
        'definition': '7월 1일 연앙인구. 해당 시군에 3개월 이상 거주하는 내국인과 외국인. 주민등록인구·재학생 수와 다름.',
        'limitations': '2022년 행정구역 기준으로 군위군 포함. 출생·사망·이동 가정에 따른 추계이며 실제 인구 및 학교별 학생배치계획이 아님. 반올림 때문에 연령별 합계와 계층별 합계가 다를 수 있음.',
        'regions': regions
    }
    output = ROOT / 'data/source/municipal-projection.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'regions': len(regions)-1, 'years': len(years), 'sha256': result['originalSha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
