/* Verified reference rules; future organization is a game scenario, never an official decision. */
const OrganizationPolicy = {
  version: 1,
  checked: '2026-11-08',
  referenceYear: 2026,
  multigrade: {
    perGradeMax: 3,
    pairTotalMax: 5,
    adjacentOnly: false,
    sourceIds: ['gb-class-2026', 'education-decree', 'gb-multigrade-case-2026']
  },
  capacity: {
    dong: 25,
    eupMyeon: 21,
    flexibleMin: 21,
    flexibleMax: 25,
    largeRuralMin: 1000,
    specialSchoolMax: 20,
    specialSchoolNames: ['월성초등학교', '흥무초등학교', '구미원당초등학교'],
    sourceIds: ['gb-class-2026']
  },
  closure: {
    automatic: false,
    studentThreshold: null,
    sourceIds: ['gb-consolidation-service', 'gimcheon-consultation-2026', 'education-autonomy']
  },
  sources: {
    'gb-class-2026': {
      title: '2026학년도 유·초·중학교 학급편성 기준 확정',
      publisher: '경상북도교육청 행정과',
      date: '2025-11-17',
      url: 'https://www.gbe.kr/news/na/ntt/selectNttInfo.do?mi=17643&nttSn=1560658&searchCate=761',
      attachment: 'https://www.gbe.kr/upload/news/na/bbs_4744/ntt_1560658/doc_f237v7779=71v3d=47v48=9dvc4=527cvafb0v30ff_v1042.hwp',
      kind: 'policy',
      finding: '첨부 기준표의 초등 복식학급 기준은 학년별 3명 이하이면서 두 개 학년 합계 5명 이하이다. 일반학급 기준은 동 25명, 읍·면 21명이며, 읍·면 1,000명 이상 학교는 2025년 편성 학급 수를 넘지 않는 범위에서 21~25명을 적용할 수 있다. 월성초·흥무초·구미원당초는 20명 기준이다.',
      limitations: '2026학년도 기준이다. 학교별 실제 학급 배정이나 미래 연도의 확정 기준이 아니다. 현재 학교 주소 자료는 시·군 단위이므로 동·읍·면과 대규모 학교의 전년도 학급 수를 확인할 수 없다. 게임에서 제시하는 복식 조합과 학급 수는 모의 검토용이다.'
    },
    'education-decree': {
      title: '초·중등교육법 시행령 제46조·제51조',
      publisher: '국가법령정보센터',
      date: '2026-10-29 시행',
      url: 'https://law.go.kr/LSW/lumLsLinkPop.do?chrClsCd=010202&lspttninfSeq=82335',
      kind: 'law',
      finding: '학급편성은 같은 학년·학과를 원칙으로 하되 교육과정 운영상 특히 필요한 경우 두 개 이상 학년을 한 학급으로 편성할 수 있다. 학교의 학급 수와 학급당 학생 수는 교육감이 정한다.',
      limitations: '법령 자체에는 경북 복식학급의 학생 수 경계나 특정 학교의 학급 배정이 규정되어 있지 않다. 학년을 함께 편성해도 학생 수가 줄어드는 것은 아니다.'
    },
    'gb-multigrade-case-2026': {
      title: '2026학년도 화목초등학교 복식학급 협력강사 채용 공고',
      publisher: '경상북도청송교육지원청·화목초등학교',
      date: '2026-03-17',
      url: 'https://www.gbe.kr/cs/na/ntt/selectNttInfo.do?mi=7002&nttSn=1591172',
      kind: 'case',
      finding: '3학년과 6학년을 함께 편성한 복식학급 한 반의 수업을 지원할 협력강사 채용을 공고했다. 경북의 실제 사례에 인접하지 않은 학년 조합도 존재한다.',
      limitations: '개별 학교의 운영 사례이며 모든 학교에 같은 조합을 적용한다는 뜻이 아니다. 협력강사 지원의 학생 유입 효과나 모든 신청 학교의 지원 보장을 입증하는 자료도 아니다.'
    },
    'gb-consolidation-service': {
      title: '행정과 행정서비스 이행표준',
      publisher: '경상북도교육청',
      date: '2024-12-06 본문 갱신·2026-11-08 확인',
      url: 'https://www.gbe.kr/main/cm/cntnts/cntntsView.do?cntntsId=2337&mi=3031',
      kind: 'policy',
      finding: '중장기 학생 수용 계획에서 학생 배치와 통학 여건을 고려하고, 소규모학교 통·폐합 추진 시 교육수요자의 의사결정 참여와 지역 공감대 형성을 명시한다.',
      limitations: '이 문서는 학생 수만으로 폐교하는 자동 기준이나 통폐합 확정 명단, 도 전체의 정량적 동의율을 제시하지 않는다. 게임의 협의 단계와 소요 연수는 절차를 단순화한 가정이다.'
    },
    'gimcheon-consultation-2026': {
      title: '적정규모 학교육성 설명회 개최',
      publisher: '경상북도김천교육지원청',
      date: '2026-07-09',
      url: 'https://www.gbe.kr/gc/na/ntt/selectNttInfo.do?mi=4568&nttSn=1628281',
      kind: 'case',
      finding: '학부모·교직원·지역주민을 대상으로 학생 수 현황과 전망, 추진 절차와 지원 정책을 설명하고 질의응답과 의견 수렴을 진행한 통폐합 검토 사례다.',
      limitations: '설명회 개최는 통폐합 최종 확정을 뜻하지 않는다. 이 사례를 다른 학교의 폐교 예정이나 학생 증가 효과로 해석할 수 없다.'
    },
    'education-autonomy': {
      title: '지방교육자치에 관한 법률 제20조',
      publisher: '국가법령정보센터',
      date: '2026-05-12 시행',
      url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsId=000898&urlMode=lsInfoP',
      kind: 'law',
      finding: '학교 등 교육기관의 설치·이전·폐지에 관한 사무는 교육감의 관장 사무로 정한다.',
      limitations: '교장이 학생 수만을 근거로 실제 학교 폐지를 확정할 수 있다는 의미가 아니다. 게임의 통합·폐지 결말은 필요한 협의와 행정 절차가 완료되었다고 가정하는 모의 선택이다.'
    }
  }
};
