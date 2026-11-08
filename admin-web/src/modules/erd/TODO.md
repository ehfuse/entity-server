# ERD Page TODO

- [x] 요구사항 확정: ERD 범위 결정 (`entities`만 / `entities + DB 보강`), 표시 항목 정의
- [x] 1차 데이터 소스 구현: `entities` 목록 API 기반 메타 로딩
- [x] 관계 추론 규칙 정의: `*_seq`, `ref_entity/ref_seq` 규칙/우선순위 문서화
- [x] ERD 변환기 구현: entities 메타를 노드/엣지 구조로 변환
- [x] `ErdPage` UI 구현: iframe 제거 후 ERD 캔버스 렌더링
- [x] 탐색 기능 추가: 줌/팬(스크롤), 검색, DB group 필터, 관계 타입 on/off
- [x] 샘플 검증: `Approval` 도메인(`approval`, `approval_comments`, `approval_files`) 관계 확인
- [x] 2차 옵션 API 설계: DB introspection read-only 조회 설계 + `/v1/admin/erd/schema` 구현
- [x] 보안 정책 반영: 관리자 제한/read-only 원칙 문서화
- [x] 보강 머지 로직 구현: entities 기반 ERD에 index table 컬럼 타입(옵션) 덮어쓰기
- [x] 성능 최적화: N+1 제거, query cache(`staleTime`) 적용
- [x] 운영 문서 작성: 관계 추론 규칙, read-only 원칙, fallback 가이드
- [x] `ErdMermaidPage` 추가: 별도 Mermaid 뷰 + 휠 줌/드래그 팬 구현
- [x] `ErdFlowPage` 추가: React Flow 기반 별도 뷰 구성
- [x] `ErdFlowPage` 고도화: 선택 엔티티 우측 상세 패널 + 하이라이트
- [x] 대형 ERD 탐색 UX: 선택 기준 1-hop/2-hop 포커스 + 모듈 접기/펼치기

## 후속 개선(선택)

- [ ] FK/인덱스 상세까지 시각 요소(아이콘/색)로 확장
- [ ] 대규모 엔티티(100+)에서 가상화 렌더링/클러스터링 추가
