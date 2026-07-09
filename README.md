## Entity Server란?

- 대부분의 사이트에서 **공통으로 필요한 백엔드 기능을 설정만으로 즉시** 사용할 수 있는 **고성능 백엔드 시스템**입니다.
- **빠른 개발 속도**는 물론, HMAC 서명·RBAC·감사 로그 등 **엔터프라이즈급 보안**과 자동 백업·이력 추적·롤백을 통한 **높은 안정성**까지 갖추고 있습니다.
- **XChaCha20-Poly1305 필드 암호화**와 **네트워크 패킷 이중 암호화**를 적용하여, JWT 토큰 탈취·네트워크 스니핑·크롤링 시도에도 실제 데이터를 완전히 보호할 수 있습니다.
- MySQL·PostgreSQL·MongoDB 등 다양한 DB를 지원하여 유연한 시스템 구성이 가능하며, 인증·보안·운영 기능을 한 서버에서 일관되게 관리할 수 있습니다.
- 반복적인 공통 작업은 서버에 위임하고, **개발자는 핵심 로직에만 집중**할 수 있도록 하는 것이 목표입니다.
  <br>

| 기능                                                   | 설명                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| [엔티티 CRUD](api-routes/api-routes.md)                | JSON 스키마로 REST API 자동 생성               |
| [로그인 · 토큰 · 탈퇴](security/auth-guide.md)         | 이메일·비밀번호 기반 인증, 계정 상태 관리      |
| [CSRF 보호](security/csrf-guide.md)                    | 브라우저 직접 통신용 CSRF 쿠키·헤더 흐름       |
| [이메일 발송](notification/smtp-guide.md)              | SMTP 다중 프로바이더, 템플릿 기반 발송         |
| [JWT 인증](security/jwt-auth-guide.md)                 | Access/Refresh 토큰, 알고리즘 선택             |
| [보안 관리](security/security.md)                      | HMAC 서명 검증, 네트워크 패킷 암호화, RBAC     |
| [감사 관리 (Audit Log)](api-routes/admin-routes.md)    | 모든 변경·접근 이벤트 자동 기록                |
| [파일 관리](extensions/storage-guide.md)               | 로컬·S3·GCS·Azure 등 다중 스토리지 지원        |
| [백업 관리](extensions/backup-guide.md)                | 자동 스케줄 백업, 암호화 및 외부 스토리지 전송 |
| [QR코드 생성](api-routes/utils-routes.md)              | URL·텍스트 기반 QR 이미지 즉시 생성            |
| [데이터 암호화](security/encryption-guide.md)          | XChaCha20-Poly1305 필드 암호화, 패킷 암호화    |
| [이력 · 리비전 · 롤백](data/history-revision-guide.md) | 모든 변경 이력 자동 추적, 특정 시점 복원       |
| [훅 (이벤트 연동)](data/hooks.md)                      | 생성·수정·삭제 이벤트에 HTTP 훅 연결           |

- 이 모든 기능을 JSON 설정만으로 간단하게 사용할 수 있습니다.

<br>

### 처음이라면 이 순서로 읽으세요

| #   | 문서명                                                  | 설명                                |
| --- | ------------------------------------------------------- | ----------------------------------- |
| 1   | [소개 · 장점 · 도입 포인트](intro/why-entity-server.md) | Entity Server가 무엇인지, 왜 쓰는지 |
| 2   | [아키텍처](intro/architecture-deployment.md)            | 시스템 구성/데이터 모델 파악        |
| 3   | [제품 비교](intro/comparison-summary.md)                | 다른 솔루션과의 차이점              |
| 4   | [기술 스택 요약](intro/tech-overview.md)                | 내부 기술 구성 파악                 |
| 5   | [시작하기](setup/getting-started.md)                    | 설치 및 초기 실행                   |
| 6   | [설정 가이드](setup/config-guide.md)                    | 각 설정 파일 상세                   |
| 7   | [데이터스토어](setup/datastore-guide.md)                | 비SQL 스토어 설정/운영              |
| 8   | [엔티티 설정](data/entity-config-guide.md)              | 엔티티 JSON 작성법                  |
| 9   | [API 라우트](api-routes/api-routes.md)                  | 전체 API 레퍼런스                   |
| 10  | [조인](api-routes/join-routes.md)                       | 조인/쿼리 패턴 사용법               |
| 11  | [운영 플레이북](operations/operations-playbook.md)      | 운영/배포 체크리스트                |

<br>

### 시작/설계

- [소개 · 장점 · 도입 포인트](intro/why-entity-server.md)
- [제품 비교](intro/comparison-summary.md)
- [기술 스택 요약](intro/tech-overview.md)
- [시작하기](setup/getting-started.md)
- [설정 가이드](setup/config-guide.md)
- [데이터스토어](setup/datastore-guide.md)
- [아키텍처](intro/architecture-deployment.md)

<br>

### 엔티티/데이터 모델

- [엔티티 설정](data/entity-config-guide.md)
- [시스템 엔티티](data/system-entities.md)
- [이력 · 리비전 · 롤백](data/history-revision-guide.md)
- [Partial Update · Async History 설계 초안](dev/design/partial-update-async-history.md)

<br>

### API/쿼리

- [API 라우트](api-routes/api-routes.md)
- [조인](api-routes/join-routes.md)
- [훅](data/hooks.md)

<br>

### 인증/보안

- [인증](security/auth-guide.md)
- [CSRF 보호](security/csrf-guide.md)
- [JWT 인증](security/jwt-auth-guide.md)
- [보안](security/security.md)
- [금융권 수준에 버금가는 보안 설계 포지셔닝](security/security-positioning.md)
- [암호화](security/encryption-guide.md)

<br>

### 운영/배포

- [운영 플레이북](operations/operations-playbook.md)
- [스크립트](operations/scripts-guide.md)
- [프리포크 벤치마크](operations/prefork-benchmark-guide.md)
- [상업 정책](operations/commercial-policy.md)

<br>

### 확장 기능

- [스토리지](extensions/storage-guide.md)
- [백업](extensions/backup-guide.md)
- [SMTP](notification/smtp-guide.md)
