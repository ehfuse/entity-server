## Entity Server란?

대부분의 사이트에서 **공통으로 필요한 백엔드 기능을 설정만으로 즉시** 쓸 수 있는 **고성능 백엔드 시스템**이다.
<br>
**빠른 개발 속도**는 물론, 암호화·HMAC 서명·RBAC·감사 로그 등 **엔터프라이즈급 보안**과 자동 백업·이력 추적·롤백을 통한 **높은 안정성**까지 갖췄다.
<br>
MySQL·PostgreSQL·MongoDB 등 다양한 DB와 인증·알림·결제 프로바이더를 지원해 유연한 시스템 구성이 가능하고, API 게이트웨이 분리 구조에서도 비즈니스 로직만 얇게 구현할 수 있다.
<br>
귀찮은 일은 서버에게 모두 맡기고 **개발자는 핵심 로직에만 집중**할 수 있도록 하는것이 목표이다.
<br>

| 기능                                                          | 설명                                           |
| ------------------------------------------------------------- | ---------------------------------------------- |
| [회원가입 · 로그인 · 탈퇴](security/auth-guide.md)            | 이메일·비밀번호 기반 인증, 계정 상태 관리      |
| [휴면 계정 자동 전환](security/privacy-policy-guide.md)       | 장기 미접속 계정 자동 휴면 전환 및 경고 발송   |
| [소셜 로그인](extensions/social-login-guide.md)               | Google, GitHub, Kakao, Naver 등 OAuth 2.0      |
| [비밀번호 변경 · 갱신 정책](security/privacy-policy-guide.md) | 비밀번호 만료·복잡도·재사용 금지 정책          |
| [이메일 발송 · 인증](notification/smtp-guide.md)              | SMTP 다중 프로바이더, 템플릿 기반 발송         |
| [문자 (SMS/LMS) · 휴대폰 인증](notification/sms-guide.md)     | 알리고·솔라피·NHN 등 다중 프로바이더 지원      |
| [카카오 알림톡](notification/alimtalk-guide.md)               | 알림톡 템플릿 발송, SMS 폴백 지원              |
| [카카오 친구톡](notification/friendtalk-guide.md)             | 이미지·버튼 포함 친구톡 발송                   |
| [모바일 푸시 알림](notification/push-guide.md)                | FCM(Android), APNs(iOS) 통합 관리              |
| [본인인증](security/auth-guide.md)                            | 휴대폰 본인인증 연동 지원                      |
| [2FA (이중 인증)](security/2fa-guide.md)                      | TOTP 기반 앱 인증, 복구 코드 관리              |
| [JWT 인증](security/jwt-auth-guide.md)                        | Access/Refresh 토큰, 알고리즘 선택             |
| PG 결제                                                       | 온라인 결제 게이트웨이 연동 (예정)             |
| [보안 관리](security/security.md)                             | HMAC 서명 검증, 네트워크 패킷 암호화, RBAC     |
| [감사 관리 (Audit Log)](api-routes/admin-routes.md)           | 모든 변경·접근 이벤트 자동 기록                |
| [파일 관리](extensions/storage-guide.md)                      | 로컬·S3·GCS·Azure 등 다중 스토리지 지원        |
| [백업 관리](extensions/backup-guide.md)                       | 자동 스케줄 백업, 암호화 및 외부 스토리지 전송 |
| [QR코드 생성](api-routes/utils-routes.md)                     | URL·텍스트 기반 QR 이미지 즉시 생성            |
| [개인정보보호 운영](security/privacy-policy-guide.md)         | 휴면·보존기간·비밀번호 정책 통합 관리          |
| [데이터 암호화](security/encryption-guide.md)                 | XChaCha20-Poly1305 필드 암호화, 패킷 암호화    |
| [이력 · 리비전 · 롤백](data/history-revision-guide.md)        | 모든 변경 이력 자동 추적, 특정 시점 복원       |
| [훅 (이벤트 연동)](api-routes/hooks.md)                       | 생성·수정·삭제 이벤트에 HTTP 훅 연결           |
| [엔티티 CRUD API](api-routes/api-routes.md)                   | JSON 스키마로 REST API 자동 생성               |
| [조인 · 쿼리](api-routes/join-routes.md)                      | 엔티티 간 조인, 필터·정렬·페이지네이션         |

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

<br>

### API/쿼리

- [API 라우트](api-routes/api-routes.md)
- [조인](api-routes/join-routes.md)
- [훅](api-routes/hooks.md)

<br>

### 인증/보안

- [인증](security/auth-guide.md)
- [JWT 인증](security/jwt-auth-guide.md)
- [보안](security/security.md)
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
- [SMS](notification/sms-guide.md)
- [알림톡](notification/alimtalk-guide.md)
- [친구톡](notification/friendtalk-guide.md)
- [푸시 알림](notification/push-guide.md)
- [소셜 로그인](extensions/social-login-guide.md)
