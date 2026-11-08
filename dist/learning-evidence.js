'use strict';

// Context for reflection. These sources do not estimate the game's coefficients.
const LEARNING_EVIDENCE = {
  checked: '2026-11-08',
  scope: '통계는 배경을, 연구와 정책 자료는 지원을 검토할 근거를 제공합니다. 게임의 예산 포인트·지원 횟수·학생 수 변화 계수는 학습용 가정이며 실제 정책의 효과나 지원 자격을 뜻하지 않습니다.',
  facts: [
    {
      id: 'cohorts',
      title: '출생의 변화는 시차를 두고 학교에 닿아요',
      text: '2025년 전국 출생아는 254,341명으로 전년보다 6.7% 늘었습니다. 최근 출생이 늘어도 이미 태어난 학년의 규모가 바로 커지는 것은 아닙니다. 오늘의 학생 수와 앞으로 들어올 학생을 함께 살펴보세요.',
      sourceIds: ['national-births-2025']
    },
    {
      id: 'regional-differences',
      title: '같은 경북이어도 지역의 전망은 달라요',
      text: '시·군별 6~11세 인구 추계의 변화율을 비교해 보세요. 이 게임은 그 변화율을 2026년 재학생 수에 맞춰 학교 전망을 계산합니다. 지역의 거주 아동 수와 학교 재학생 수는 서로 다른 통계입니다.',
      sourceIds: ['gb-municipal-projection-2024']
    },
    {
      id: 'movement',
      title: '우리 학교의 증가가 지역 전체의 증가는 아닐 수 있어요',
      text: '다른 학교에서 전학 온 학생은 새로 태어난 학생과 다릅니다. 학교 사이 이동, 지역 사이 주소 이동, 출생에 따른 학년 규모를 구별하며 학교와 지역이 함께 좋아지는 방법을 생각해 보세요.',
      sourceIds: ['domestic-migration-definition']
    },
    {
      id: 'public-support',
      title: '학교 밖의 협력은 무엇을 도울 수 있을까요?',
      text: '경북교육청은 농산어촌 순회 방과후 강사와 지자체 연계 돌봄 등에 예산을 지원한 내역을 공개합니다. 인력·돌봄·공동 운영은 학교 혼자 준비하기 어려울 수 있습니다. 어느 지원이 필요한지, 다른 사업보다 우선할 이유가 있는지 따져보세요.',
      sourceIds: ['gb-learning-care-budget-2025']
    },
    {
      id: 'learning-quality',
      title: '학생 수와 배움의 질을 함께 살펴요',
      text: '작은 초등학교 6곳을 살펴본 연구에서는 교사와 학생의 가까운 소통, 지역 연계 학습 등의 장점도 관찰했습니다. 학생 수만으로 학교의 가치를 판단하기보다 친구와의 교류, 만족도, 통학 여건도 함께 살펴보세요.',
      sourceIds: ['small-school-learning-2021']
    }
  ],
  sources: {
    'national-births-2025': {
      title: '출생 사망 추이 · 2025년 출생통계',
      publisher: '국가데이터처 · e-나라지표',
      date: '2025년 통계 / 2026년 공표',
      url: 'https://www.index.go.kr/unity/potal/indicator/IndexInfo.do?clasCd=2&idxCd=1011',
      finding: '전국 출생아는 2024년 238,317명, 2025년 254,341명이며 2025년 합계출산율은 0.80입니다. 이미 태어난 학년과 최근 출생의 변화를 구분할 때 참고합니다.',
      limitations: '전국의 연간 출생 통계입니다. 특정 지역·학교의 입학생 수나 정책의 인과효과를 보여주지 않습니다. 학교에 도달하는 시차는 학년별 인구를 읽기 위한 설명입니다.'
    },
    'gb-municipal-projection-2024': {
      title: '경상북도 시군별 장래인구추계 · 2022~2042년',
      publisher: '경상북도',
      date: '2024-12-20',
      url: 'https://www.gb.go.kr/Sub/open_contents/section/datastat/page.do?BD_CODE=gb_statboard&B_STEP=260419700&cmd=2&mnu_uid=7866',
      finding: '시·군별 연령별 장래 거주 인구를 제공합니다. 게임은 현재 경북 22개 시·군의 6~11세 변화율을 2026년 재학생 총계에 맞춰 비교합니다.',
      limitations: '거주 인구의 추계이며 학교별 공식 학생 수 예측이 아닙니다. 2043~2045년은 도 단위 추세를 이용한 게임의 연장 가정입니다. 추계의 지역 차이를 특정 정책이나 이동의 효과로 단정할 수 없습니다.'
    },
    'domestic-migration-definition': {
      title: '국내인구이동 · 지표 정의',
      publisher: '국가데이터처 · e-나라지표',
      date: '상시 갱신 지표',
      url: 'https://www.index.go.kr/unify/idx-info.do?idxCd=1013',
      finding: '국내인구이동은 읍·면·동 경계를 넘어 거주지를 변경한 전입신고를 집계하며 순이동은 전입에서 전출을 뺀 값입니다.',
      limitations: '모든 연령의 주소 이동 통계입니다. 학교 간 전학과 동일하지 않으며 주소 이전 없는 전학도 있을 수 있습니다. 게임은 개별 학생이나 가족의 실제 이동 사유를 알지 못합니다.'
    },
    'gb-learning-care-budget-2025': {
      title: '2025 주요 추진성과 · 따뜻함을 더하는 학교',
      publisher: '경상북도교육청',
      date: '2025-12 말 기준 / 2026-02-06 갱신',
      url: 'https://www.gbe.kr/opengbe/cm/cntnts/cntntsView.do?cntntsId=9446&mi=20294',
      finding: '농산어촌 순회 방과후 전문강사제에 2,521백만원, 지자체 연계 지역특화 돌봄 사업에 2억원을 지원한 내역과 지역별 돌봄 협의체 운영을 공개합니다.',
      limitations: '교육청이 공개한 예산·운영 내역입니다. 학생 수 증가의 인과효과를 검증한 평가가 아닙니다. 게임의 +24포인트 지원과 횟수·간격은 이 사업의 금액이나 실제 신청 조건을 환산한 것이 아닙니다.'
    },
    'small-school-learning-2021': {
      title: '소규모 초등학교에서의 긍정적 학습경험 분석',
      publisher: '이미숙·이수정·조보경·이상아·조기희 · 교육과정평가연구 24(2)',
      date: '2021-05-31',
      url: 'https://www.ejce.org/archive/view_article?pid=jce-24-2-1',
      finding: '학생 수 30명 미만 농어촌 초등학교 6곳의 관찰·면담·문서를 분석해 가까운 소통, 지역 연계 학습, 문화 체험의 장점을 보고하고 교육과정 운영과 교원 지원 방안을 제안합니다.',
      limitations: '2019년 현장 조사에 바탕을 둔 질적 사례연구입니다. 모든 작은 학교에 일반화하거나 예산 투입에 따른 학생 수 증가율로 바꿔 적용할 수 없습니다.'
    }
  }
};
