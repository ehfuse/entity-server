# ERD Module Guide

## 목표

- 1차: `entities` 메타데이터 기반 논리 ERD를 빠르게 시각화
- 2차(옵션): DB introspection으로 물리 스키마(컬럼 타입/인덱스/FK) 보강

## 1차 관계 추론 규칙

- `*_seq` 필드가 있고, 접두 엔티티명이 실제 엔티티명과 일치하면 direct relation으로 연결
  - 예: `approval_comments.approval_seq -> approval`
- `ref_entity` + `ref_seq`가 동시에 있으면 polymorphic relation으로 표시
- 기본적으로 index 필드만 사용해 관계를 추론

## 현재 화면 기능

- 엔티티/필드 검색
- DB group 필터
- 관계 타입 필터 (`direct`, `polymorphic`)
- 다이어그램 줌(스크롤 기반 팬)
- 엔티티/관계 개수 요약

## 2차 옵션 설계 (Read-only)

- 목적: 1차 논리 ERD 위에 물리 DB 메타데이터를 덮어 정확도 보강
- 원칙: `SELECT` 기반 introspection만 수행 (쓰기 금지)
- 데이터 소스:
  - MySQL/PostgreSQL: `information_schema`
  - SQLite: `pragma` 계열 메타 조회
- 보강 항목:
  - 컬럼 실제 타입 / nullable / default
  - 인덱스 및 유니크 정보
  - FK 제약 존재 여부

## 보안 정책

- introspection API는 관리자 권한에 한정
- DB 계정은 read-only 권한 분리 권장
- 민감정보(비밀번호/시크릿)는 ERD 응답에서 제외
- 장애 시 1차(`entities` 기반) 렌더링으로 자동 fallback

## 샘플 검증 로그 (Approval)

- `approval_comments.approval_seq -> approval` (direct)
- `approval_files.approval_seq -> approval` (direct)
- `approval_reference.approval_seq -> approval` (direct)
- `approval.account_seq -> account` (direct)
