## 핵심 개념 요약

- 엔티티 JSON 정의만으로 DB 테이블 + CRUD API + 인증 체계를 빠르게 구성
- `index` 필드는 검색/정렬용 평문 컬럼으로 분리되고, 본문은 암호화 저장
- 변경 이력은 revision으로 자동 기록되어 트랜잭션 단위 롤백 지원

# 문서 그룹

이 문서는 배포 사용자를 위한 **배포용 문서 진입점**입니다.

## 1) 배포용 문서 (바이너리 사용자)

대상: `entity-server` 바이너리를 받아 설정하고, API/엔티티 정의로 백엔드를 만드는 개발자

Entity Server가 무엇이고 왜 쓰는지 빠르게 보려면 [Entity Server 소개 · 장점 · 도입 포인트](guides/intro/why-entity-server.md)를 먼저 읽어보세요.

- 시작점: [배포용 가이드 맵](guides/README.md)
- 소개: [Entity Server 소개 · 장점 · 도입 포인트](guides/intro/why-entity-server.md)
- 비교: [제품 비교 (배포용)](guides/intro/comparison-summary.md)
- 기술: [기술 스택 요약 (배포용)](guides/intro/tech-overview.md)
- 빠른 시작: [Getting Started](guides/setup/getting-started.md)
- API 레퍼런스: [API Routes](api-routes/api-routes.md)

권장 읽기 순서:

1. [Entity Server 소개 · 장점 · 도입 포인트](guides/intro/why-entity-server.md)
2. [제품 비교 (배포용)](guides/intro/comparison-summary.md)
3. [기술 스택 요약 (배포용)](guides/intro/tech-overview.md)
4. [Getting Started](guides/setup/getting-started.md)
5. [Config Guide](guides/setup/config-guide.md)
6. [Entity Config Guide](guides/data/entity-config-guide.md)
7. [API Routes](api-routes/api-routes.md)
8. [Operations Playbook](guides/operations/operations-playbook.md)

## 문서 진입 규칙

- 배포용 문서는 **설정/운영/API 사용 중심**으로 유지
