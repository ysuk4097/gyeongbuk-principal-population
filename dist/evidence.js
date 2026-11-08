'use strict';

// Curated source summaries, not measured coefficients for the population model.
const POLICY_EVIDENCE_META = {
  checked: '2026-11-08',
  scope: '학생 유입 사례와 교육·돌봄의 간접 근거를 구분합니다. 사례는 인과효과의 증명이 아니며, 게임의 학생 수 증감 계수는 연구에서 추정한 값이 아닙니다.'
};

const POLICY_SOURCES = {
  'gb-free-district-2025': {
    title: '2025 주요 추진성과 · 작은 학교 자유학구제 내실화',
    publisher: '경상북도교육청',
    date: '2025-12 기준',
    url: 'https://www.gbe.kr/opengbe/cm/cntnts/cntntsView.do?cntntsId=9445&mi=20294',
    kind: 'case',
    finding: '교육청은 2025년 3월 4일 기준 작은 학교 135교에 학생 515명이 유입됐다고 집계했습니다. 자유학구제 운영 예산과 학생 유입 실적을 함께 제시한 행정자료입니다.',
    limitations: '개별 학교의 순증가나 통학버스만의 효과를 뜻하지 않습니다. 학구 조정·교육과정 등 여러 지원이 함께 작용하며, 다른 학교에서 이동한 학생이므로 지역 전체 학생 수의 증가와도 구별해야 합니다.'
  },
  'small-school-study-2022': {
    title: '두 초등학교 사례를 통한 원도심 작은학교의 활성화 방안 연구',
    publisher: '위미나·차형률 · 수산해양교육연구 34(2), 234–255',
    date: '2022-04-30',
    url: 'https://english.ksfme.or.kr/_common/do.php?a=full&aidx=32739&b=12&bidx=2907',
    kind: 'research',
    finding: '창원 원도심의 작은 초등학교 두 곳에 관한 면담 연구입니다. 특색 교육과정, 지역 자원 연계, 교육복지와 학교 환경 지원을 활성화 방향으로 제안합니다.',
    limitations: '질적 사례연구로, 개별 정책이 전학생을 몇 명 늘렸는지 인과적으로 추정하지 않았습니다. 시설·협력·복지 선택의 참고 근거이며 경북 학교의 효과를 보장하지 않습니다.'
  },
  'small-school-cases-2022': {
    title: '농어촌에 활력을, 아이들에 활기를…‘참 좋은 작은 학교’',
    publisher: '대한민국 정책브리핑 · 윤세리',
    date: '2022-02-08',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148898779',
    kind: 'case',
    finding: '백봉초는 마을과 학교의 협력 사업 속에서 재학생이 2019년 26명, 2020년 38명, 기사 시점 48명으로 늘어난 사례로 소개됩니다. 인근 학교와의 방과후 프로그램과 자연놀이 교육도 함께 운영했습니다.',
    limitations: '여러 해의 지역·학교 사업을 묶어 소개한 사례입니다. 축제, 도서관, 스포츠나 생태활동 하나의 효과를 분리한 연구가 아니며, 사례의 증가율을 다른 학교에 그대로 적용할 수 없습니다.'
  },
  'namhae-housing-2025': {
    title: '남해 빈집 재생 사업 순항…성명초 전·입학 학생 가정 늘어',
    publisher: '뉴스1 · 강미영',
    date: '2025-03-14',
    url: 'https://www.news1.kr/local/busan-gyeongnam/5719186',
    kind: 'case',
    finding: '남해군이 빈집 네 곳을 전·입학 학생 가정에 임대해 21명이 입주했으며, 성명초에는 유치원생 한 명을 포함한 아홉 명이 입학했다고 보도했습니다. 초등학생만으로는 여덟 명입니다.',
    limitations: '주택 제공과 가족 이주가 함께 이뤄진 지역 사례입니다. 개발 논의나 학교 홍보만으로 같은 결과가 발생한다는 근거가 아니며, 일자리·주거 여건과 지자체 협력이 필요합니다.'
  },
  'rural-study-policy-2024': {
    title: '[모집 안내] 2024학년도 2학기 2차 전남농산어촌유학생 모집',
    publisher: '전라남도교육청 교육자치과',
    date: '2024-07-12',
    url: 'https://www.jne.go.kr/jne/na/ntt/selectNttInfo.do?mi=1204&nttSn=5120010',
    kind: 'policy',
    finding: '도시 학생을 농산어촌 학교에 연결하는 실제 모집 절차입니다. 학교 매칭, 학교·주택 사전방문, 배정 뒤 주소 이전과 전학 처리 과정을 안내합니다.',
    limitations: '모집·운영 안내이지 학생 유입 실적이나 인과효과 평가가 아닙니다. 체험 참가가 곧 전학·정착으로 이어지는 것은 아니며, 해당 연도의 자격·지원 조건을 모든 학교에 적용할 수 없습니다.'
  },
  'dangpo-curriculum-2022': {
    title: '교육부 ‘참 좋은 작은 학교’에 경북 조마초교·당포초교·청하중 선정',
    publisher: '뉴시스 · 류상현',
    date: '2022-12-15',
    url: 'https://www.newsis.com/view/NISX20221215_0002123905',
    kind: 'case',
    finding: '문경 당포초는 골프·도예·국궁 등 열한 개 방과후 프로그램과 지역 공동체 활동을 운영하며, 재학생이 2021년 24명에서 2022년 38명으로 늘었다고 소개됐습니다.',
    limitations: '방과후 교육과 마을 활동 등을 함께 시행한 사례 보도입니다. 특정 강좌나 행사 하나가 증가를 일으켰다는 인과 증거, 또는 동일한 증가율을 보장하는 자료는 아닙니다.'
  },
  'neulbom-care-2024': {
    title: '범부처 협력을 통해 늘봄학교 운영을 성공적으로 이어 나간다',
    publisher: '교육부',
    date: '2024-07-15',
    url: 'https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=100295&lev=0&m=020402&opType=N&page=1&s=moe&searchType=null&statusYN=W',
    kind: 'policy',
    finding: '교육부는 2024년 1학기 늘봄학교 운영교 2,963곳의 초등학교 1학년 돌봄 대기가 해소됐고 학부모 만족도가 80% 이상이었다고 발표했습니다.',
    limitations: '돌봄 이용과 만족도에 관한 운영 결과입니다. 돌봄 확대 때문에 전입·입학생 또는 재학생 수가 늘어났음을 검증한 자료는 아닙니다.'
  },
  'eef-small-group-tuition': {
    title: 'Small group tuition · 소집단 학습 지원 근거 검토',
    publisher: 'Education Endowment Foundation (EEF)',
    date: '2021-07 검토 갱신',
    url: 'https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/small-group-tuition',
    kind: 'research',
    finding: '교육 근거 검토는 학습 필요에 맞춘 소집단 지도에서 평균적인 학습 진전 효과가 나타났다고 정리합니다. 진단, 수업과의 연결, 지도 인력의 준비가 실행 조건입니다.',
    limitations: '측정한 결과는 학습 성취이며 입학생·전학생 증가가 아닙니다. 평균적인 학습 효과를 경북 학교의 학생 수 증가율로 바꾸어 적용할 수 없습니다.'
  },
  'anti-bullying-review-2021': {
    title: 'Effectiveness of school-based programs to reduce bullying perpetration and victimization: An updated systematic review and meta-analysis',
    publisher: 'Gaffney·Ttofi·Farrington · Campbell Systematic Reviews',
    date: '2021-04-05',
    url: 'https://onlinelibrary.wiley.com/doi/10.1002/cl2.1143',
    kind: 'research',
    finding: '학교 기반 괴롭힘 예방 프로그램을 평가한 100개 연구를 종합해 가해·피해 행동의 평균적인 감소를 보고했습니다. 프로그램·대상·평가 방식에 따라 효과 차이가 컸습니다.',
    limitations: '괴롭힘 행동 감소에 관한 근거입니다. 일반적인 상담 하나의 효과, 재학생 유지나 전학생 증가를 직접 검증한 결과로 해석해서는 안 됩니다.'
  }
};
