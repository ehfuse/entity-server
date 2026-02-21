# Join 가이드

Entity Server에서 엔티티 간 조인을 수행하는 방법을 설명합니다.

## 목차

- [조인 방식 개요](#조인-방식-개요)
- [자동 인덱스 조인](#자동-인덱스-조인)
- [커스텀 SQL 조인](#커스텀-sql-조인)
- [제약사항](#제약사항)
- [사용 예시](#사용-예시)

---

## 조인 방식 개요

Entity Server는 두 가지 조인 방식을 제공합니다:

| 방식                 | 사용 시점      | 장점                            | 제약사항                       |
| -------------------- | -------------- | ------------------------------- | ------------------------------ |
| **자동 인덱스 조인** | List API 호출  | 자동으로 최적화된 조인 수행     | 단일 엔티티의 검색 조건만 가능 |
| **커스텀 SQL 조인**  | Query API 호출 | 복잡한 조인 구문 직접 작성 가능 | 조건은 인덱스 필드만 사용 가능 |

---

## 자동 인덱스 조인

### 동작 원리

List API에서 검색 조건(`conditions`)이 있으면 자동으로 데이터 테이블과 인덱스 테이블을 INNER JOIN합니다.

**API 호출 예시**:

```bash
POST /v1/entity/account/list
Content-Type: application/json

{
    "status": "active",
    "email": "hong@example.com"
}
```

**내부적으로 생성되는 쿼리**:

```sql
-- 내부적으로 생성되는 쿼리
SELECT d.seq, d.data, d.created_time, d.updated_time
FROM entity_data_account d
INNER JOIN entity_idx_account i ON i.data_seq = d.seq
WHERE d.deleted_time IS NULL
    AND i.status = ?
    AND i.email = ?
ORDER BY d.seq DESC
LIMIT 20 OFFSET 0
```

### 언제 사용되는가?

- **조건 없음**: Data 테이블만 조회 (JOIN 없음)
- **seq만 조건**: Data 테이블만 조회 (JOIN 없음)
- **인덱스 필드 조건**: Data + Index 테이블 INNER JOIN

### 성능 고려사항

**Index 테이블 활용**:

- 검색 조건이 있는 필드는 반드시 `index` 또는 `hash`에 정의되어야 함
- Index 테이블에 없는 필드로 검색하면 전체 데이터 스캔 발생

**정렬 최적화**:

- `order_by`가 index 필드면 해당 컬럼으로 정렬
- `order_by`가 없거나 index에 없으면 `seq`로 정렬
- `-` 접두사로 내림차순 지정 (`order_by=-email` → 이메일 내림차순)

**필드 선택 최적화**:

- `fields` 파라미터로 필요한 필드만 요청하면 네트워크 전송량 감소
- **인덱스 전용 모드**: 인덱스 필드만 요청 시 복호화 건너뛰기 (성능 향상)
    - `?fields=@indexes` - 모든 인덱스 필드 반환
    - `?fields=email,status,rbac_role` - 특정 인덱스 필드만 반환
- `fields`를 **지정하지 않으면** 기본적으로 본문(data) 복호화를 수행하여 엔티티 전체 필드(soft-delete 제외)를 반환
- 일반 필드 포함 시 전체 data 복호화 필요
- `seq`, `created_time`, `updated_time`, `license_seq`는 항상 포함
- **검증**: 존재하지 않는 필드 요청 시 에러 발생

**`fields` 미지정 시 동작 요약**:

- 반환 범위: 엔티티 본문 전체 + 기본 메타 필드(`seq`, `created_time`, `updated_time`, `license_seq`)
- 처리 방식: data 컬럼 복호화 수행
- 성능 특성: 인덱스 전용 조회(`@indexes`)보다 CPU/응답 크기 비용이 큼

### 예시

**엔티티 설정** (`entities/Auth/account.json`):

```json
{
    "name": "account",
    "index": ["email", "status", "rbac_role"],
    "required": ["email"],
    "types": {
        "email": "string",
        "status": ["active", "inactive", "blocked"],
        "rbac_role": "string"
    }
}
```

**API 요청**:

```bash
POST /v1/entity/account/list
Content-Type: application/json

{
    "status": "active",
    "email": "hong@example.com"
}
```

**쿼리 파라미터**:

- `page=1`
- `limit=20`
- `order_by=email` (선택, 오름차순)
- `order_by=-email` (선택, 내림차순)
- `fields=email,status` (선택, 특정 필드만)
- `fields=@indexes` (선택, 모든 인덱스 필드만, 복호화 불필요)

**내부 생성 쿼리**:

```sql
SELECT d.seq, d.data, d.created_time, d.updated_time
FROM entity_data_account d
INNER JOIN entity_idx_account i ON i.data_seq = d.seq
WHERE d.deleted_time IS NULL
    AND i.status = 'active'
    AND i.email = 'hong@example.com'
ORDER BY i.email ASC
LIMIT 20 OFFSET 0
```

---

## 커스텀 SQL 조인

### 동작 원리

Query API를 사용하여 여러 엔티티의 인덱스 테이블을 직접 조인할 수 있습니다.

**핵심 특징**:

- 엔티티명을 `_index` 테이블로 자동 변환
- WHERE/JOIN ON 조건 필드는 인덱스 필드만 허용
- SELECT 필드는 인덱스 필드는 즉시 반환, 일반 필드는 결과 단계에서 복호화해 채움

### 엔티티명 변환 규칙

SQL에서 사용하는 엔티티명은 자동으로 인덱스 테이블명으로 변환됩니다:

| SQL에서 사용  | 실제 테이블명            |
| ------------- | ------------------------ |
| `user`        | `entity_idx_user`        |
| `company`     | `entity_idx_company`     |
| `user_device` | `entity_idx_user_device` |

### 기본 구조

**엔드포인트**: `POST/GET /v1/entity/:entity/query`

**요청 본문**:

```json
{
    "sql": "SELECT u.name, u.email, c.name as company FROM user u LEFT JOIN company c ON u.company_seq = c.data_seq WHERE u.active = ? AND c.industry = ?",
    "params": [true, "IT"],
    "limit": 100
}
```

- `params[0]` (true)이 첫 번째 `?`에 바인딩
- `params[1]` ("IT")이 두 번째 `?`에 바인딩

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [...],
        "count": 10
    }
}
```

### 사용 가능한 필드

Query API는 용도별로 필드 규칙이 다릅니다.

- **WHERE/JOIN ON 조건 필드**: 반드시 각 엔티티의 `index` 또는 `hash`(및 기본 인덱스 필드)에 있어야 함
- **SELECT 필드**: 인덱스 필드는 바로 반환, 일반 필드는 `alias.field` 형태로 지정 시 복호화 후 채워 반환

**기본 제공 필드**:

- `data_seq` - 원본 데이터 seq (FK)
- `created_time` - 생성 시각
- `updated_time` - 수정 시각

**엔티티 설정 필드**:

- `index` 배열에 정의된 모든 필드
- `hash` 배열에 정의된 모든 필드

### JOIN 유형

**INNER JOIN**:

```sql
SELECT u.name, c.name as company
FROM user u
INNER JOIN company c ON u.company_seq = c.data_seq
WHERE u.active = ?
```

**LEFT JOIN**:

```sql
SELECT u.name, c.name as company
FROM user u
LEFT JOIN company c ON u.company_seq = c.data_seq
WHERE u.active = ?
```

**RIGHT JOIN**:

```sql
SELECT u.name, d.device_name
FROM user u
RIGHT JOIN user_device d ON u.data_seq = d.user_seq
WHERE d.active = ?
```

**다중 JOIN**:

```sql
SELECT
    u.name,
    e.position,
    d.department_name
FROM user u
INNER JOIN employee e ON u.data_seq = e.user_seq
LEFT JOIN department d ON e.department_seq = d.data_seq
WHERE u.active = ?
```

---

## 제약사항

### 1. 조건 필드는 인덱스 필드만 사용 가능

**불가능** (조건에 일반 필드 사용):

```sql
-- 일반 필드는 WHERE/JOIN ON 조건에서 사용 불가
SELECT u.name FROM user u WHERE u.memo = ?
```

**가능** (SELECT 일반 필드는 허용):

```sql
-- 인덱스 필드
SELECT u.name, u.email FROM user u WHERE u.email = ?

-- 일반 필드 (alias.field 형식): 결과 단계에서 복호화 후 채움
SELECT u.memo, u.profile_json FROM user u WHERE u.email = ?
```

### 2. SELECT 문만 허용

**불가능**:

```sql
-- UPDATE, DELETE, INSERT 등 불가
UPDATE user SET active = false WHERE seq = 1
```

**가능**:

```sql
-- SELECT만 가능
SELECT * FROM user WHERE active = true
```

### 3. 와일드카드 제한

**권장하지 않음**:

```sql
-- 모든 컬럼을 가져오므로 검증 우회
SELECT * FROM user
```

**권장**:

```sql
-- 필요한 필드만 명시
SELECT u.name, u.email, u.active FROM user u
```

### 4. LIMIT 제한

- 기본 제한: 요청 시 `limit` 파라미터로 지정
- 최대값: 1000개
- 초과 시 자동으로 1000으로 제한

### 5. 파라미터 바인딩

**동적 값이 포함된 쿼리는 반드시 파라미터 바인딩 사용** (SQL Injection 방지):

**잘못된 예** (SQL Injection 위험):

```json
{
    "sql": "SELECT * FROM user WHERE email = 'test@example.com'"
}
```

**올바른 예**:

```json
{
    "sql": "SELECT * FROM user WHERE email = ?",
    "params": ["test@example.com"]
}
```

**정적 쿼리** (파라미터 없이도 가능):

```json
{
    "sql": "SELECT name, email FROM user WHERE active = true"
}
```

> **보안 권장사항**: 사용자 입력값이나 외부 데이터를 SQL에 포함할 때는 **반드시** 파라미터 바인딩을 사용하세요.

---

## 사용 예시

### 예시 1: 사용자와 회사 정보 조인

**엔티티 설정**:

`entities/Auth/account.json`:

```json
{
    "name": "account",
    "index": ["email", "status", "rbac_role", "company_seq"]
}
```

`entities/company.json`:

```json
{
    "name": "company",
    "index": ["name", "industry"]
}
```

**API 요청**:

```bash
POST /v1/entity/account/query
Content-Type: application/json

{
    "sql": "SELECT u.name as user_name, u.email, c.name as company_name, c.industry FROM user u LEFT JOIN company c ON u.company_seq = c.data_seq WHERE u.active = ?",
    "params": [true],
    "limit": 50
}
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "user_name": "홍길동",
                "email": "hong@example.com",
                "company_name": "ABC회사",
                "industry": "IT"
            },
            {
                "user_name": "김철수",
                "email": "kim@example.com",
                "company_name": null,
                "industry": null
            }
        ],
        "count": 2
    }
}
```

### 예시 2: 사용자와 디바이스 조인

**엔티티 설정**:

`entities/Auth/account.json`:

```json
{
    "name": "account",
    "index": ["email", "status", "rbac_role"]
}
```

`entities/User/user_device.json`:

```json
{
    "name": "user_device",
    "index": ["user_seq", "device_name", "device_type", "last_login"]
}
```

**API 요청**:

```bash
POST /v1/entity/account/query
Content-Type: application/json

{
    "sql": "SELECT u.name, u.email, d.device_name, d.device_type, d.last_login FROM user u INNER JOIN user_device d ON u.data_seq = d.user_seq WHERE d.device_type = ? ORDER BY d.last_login DESC",
    "params": ["mobile"],
    "limit": 100
}
```

### 예시 3: 다중 조인 (사용자 + 직원 + 부서)

**엔티티 설정**:

`entities/Auth/account.json`:

```json
{
    "name": "account",
    "index": ["email", "status", "rbac_role"]
}
```

`entities/employee.json`:

```json
{
    "name": "employee",
    "index": ["user_seq", "department_seq", "position", "hire_date"]
}
```

`entities/department.json`:

```json
{
    "name": "department",
    "index": ["name", "manager_seq"]
}
```

**API 요청**:

```bash
POST /v1/entity/account/query
Content-Type: application/json

{
    "sql": "SELECT u.name as user_name, u.email, e.position, e.hire_date, d.name as department_name FROM user u INNER JOIN employee e ON u.data_seq = e.user_seq LEFT JOIN department d ON e.department_seq = d.data_seq WHERE u.active = ? ORDER BY e.hire_date DESC",
    "params": [true],
    "limit": 200
}
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "user_name": "홍길동",
                "email": "hong@example.com",
                "position": "Manager",
                "hire_date": "2025-01-15",
                "department_name": "개발팀"
            },
            {
                "user_name": "김철수",
                "email": "kim@example.com",
                "position": "Developer",
                "hire_date": "2024-11-20",
                "department_name": "개발팀"
            }
        ],
        "count": 2
    }
}
```

### 예시 4: 집계 함수 사용

**API 요청**:

```bash
POST /v1/entity/company/query
Content-Type: application/json

{
    "sql": "SELECT c.name as company_name, c.industry, COUNT(u.data_seq) as employee_count FROM company c LEFT JOIN user u ON c.data_seq = u.company_seq WHERE u.active = ? GROUP BY c.data_seq, c.name, c.industry ORDER BY employee_count DESC",
    "params": [true],
    "limit": 50
}
```

**응답**:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "company_name": "ABC회사",
                "industry": "IT",
                "employee_count": 150
            },
            {
                "company_name": "XYZ회사",
                "industry": "제조",
                "employee_count": 85
            }
        ],
        "count": 2
    }
}
```

---

## 베스트 프랙티스

### 1. 자주 조인되는 필드는 인덱스에 추가

**권장**:

```json
{
    "name": "account",
    "index": ["company_seq", "department_seq", "manager_seq"]
}
```

외래 키 역할을 하는 필드를 인덱스에 추가하면 조인 성능이 향상됩니다.

### 2. 필요한 필드만 SELECT

**비권장**:

```sql
SELECT * FROM user u JOIN company c ON u.company_seq = c.data_seq
```

**권장**:

```sql
SELECT u.name, u.email, c.name as company_name
FROM user u JOIN company c ON u.company_seq = c.data_seq
```

### 3. 파라미터 바인딩 사용

**위험** (SQL Injection 취약점):

```json
{
    "sql": "SELECT * FROM user WHERE email = 'test@example.com'"
}
```

**안전** (파라미터 바인딩):

```json
{
    "sql": "SELECT * FROM user WHERE email = ?",
    "params": ["test@example.com"]
}
```

**허용** (정적 쿼리, 동적 값 없음):

```json
{
    "sql": "SELECT * FROM user WHERE active = true"
}
```

### 4. LIMIT 설정

대량 데이터 조회 시 반드시 limit를 설정하세요:

```json
{
    "sql": "SELECT u.name, c.name FROM user u JOIN company c ON u.company_seq = c.data_seq",
    "limit": 100
}
```

### 5. 인덱스 전용 조회로 성능 최적화

인덱스 필드만 필요한 경우 복호화를 건너뛰어 성능을 향상시킬 수 있습니다:

**모든 인덱스 필드 조회**:

```bash
GET /v1/entity/account/list?fields=@indexes
```

**특정 인덱스 필드만 조회**:

```bash
GET /v1/entity/account/list?fields=email,status,rbac_role
```

**장점**:

- data 컬럼 조회 생략
- 복호화 과정 건너뛰기
- 쿼리 속도 향상
- 네트워크 전송량 감소

**사용 시나리오**:

- 대시보드 목록 (이름, 상태만)
- 검색 결과 (제목, 요약만)
- 드롭다운 선택지 (ID, 이름만)

### 6. 엔티티 훅으로 관계 데이터 자동 로드

간단한 1:N 관계는 커스텀 SQL 대신 Entity 훅 사용을 권장합니다:

```json
{
    "hooks": {
        "after_get": [
            {
                "type": "entity",
                "entity": "user_device",
                "action": "list",
                "conditions": {
                    "user_seq": "${new.seq}"
                },
                "assign_to": "devices"
            }
        ]
    }
}
```

**장점**:

- SQL 작성 불필요
- 암호화된 본문 데이터 접근 가능
- 자동으로 검증/암복호화 수행

**단점**:

- 복잡한 조인이나 집계 쿼리는 불가능
- N+1 문제 발생 가능 (대량 조회 시)

---

## 요약

| 기능            | 자동 인덱스 조인                     | 커스텀 SQL 조인                 | Entity 훅          |
| --------------- | ------------------------------------ | ------------------------------- | ------------------ |
| **API**         | List                                 | Query                           | Get                |
| **복잡도**      | 낮음                                 | 높음                            | 낮음               |
| **조인 제어**   | 자동                                 | 수동                            | 자동               |
| **필드 접근**   | 전체 또는 인덱스만 (fields 파라미터) | 조건=인덱스, SELECT=인덱스+일반 | 전체 (암호화 포함) |
| **복호화**      | 선택적 (인덱스 전용 모드 가능)       | 일반 필드 선택 시 수행          | 필수               |
| **집계 함수**   | 불가능                               | 가능                            | 불가능             |
| **다중 엔티티** | 단일만                               | 가능                            | 가능               |
| **성능**        | 최적화됨                             | 수동 최적화                     | N+1 위험           |
| **필드 선택**   | `fields=@indexes` 지원               | SELECT 절                       | 전체 반환          |

**선택 가이드**:

- **단일 엔티티 전체 조회**: List API (기본)
- **단일 엔티티 인덱스만 조회**: List API + `fields=@indexes` (빠름)
- **복잡한 조인/집계**: Query API (커스텀 SQL)
- **단건 조회 + 관계 데이터**: Entity 훅
