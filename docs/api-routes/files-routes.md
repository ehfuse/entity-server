# 파일 라우트

`/v1/files` 엔드포인트 상세 가이드입니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.
- 스토리지 설정, 썸네일, 쿼터 등 운영 가이드는 [스토리지](../extensions/storage-guide.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                             | 메서드 | 경로                               | 인증                  |
| --- | -------------------------------- | ------ | ---------------------------------- | --------------------- |
| 1   | [파일 인라인 뷰](#files-view)    | `GET`  | `/v1/files/:uuid`                  | 공개/토큰/JWT/API Key |
| 2   | [임시토큰 발급](#files-token)    | `POST` | `/v1/files/token/:uuid`            | `files:token`         |
| 3   | [파일 업로드](#files-upload)     | `POST` | `/v1/files/:entity/upload`         | `files:upload`        |
| 4   | [파일 다운로드](#files-download) | `POST` | `/v1/files/:entity/download/:uuid` | `files:download`      |
| 5   | [파일 삭제](#files-delete)       | `POST` | `/v1/files/:entity/delete/:uuid`   | `files:delete`        |
| 6   | [파일 목록](#files-list)         | `POST` | `/v1/files/:entity/list`           | `files:list`          |
| 7   | [파일 메타 조회](#files-meta)    | `POST` | `/v1/files/:entity/meta/:uuid`     | `files:meta`          |

> 모든 파일 API는 `configs/extensions/storage.json`이 설정되어 있어야 사용 가능합니다. 미설정 시 `500` 에러를 반환합니다.

---

<a id="files-view"></a>

### 1. 파일 인라인 뷰

브라우저에서 파일을 바로 표시합니다. 이미지·PDF는 브라우저가 인라인 렌더링하고, `?download` 파라미터 추가 시 강제 다운로드합니다.

**엔드포인트**: `GET /v1/files/:uuid`

**URL 파라미터:**

| 파라미터 | 필수 | 설명      |
| -------- | ---- | --------- |
| `:uuid`  | ✅   | 파일 UUID |

**Query 파라미터:**

| 파라미터   | 기본값 | 설명                                                                               |
| ---------- | ------ | ---------------------------------------------------------------------------------- |
| `download` | -      | 존재 시 `Content-Disposition: attachment` (값은 무관 — `=1`, `=timestamp` 등 가능) |
| `thumb`    | -      | 썸네일 크기: `sm`, `md`, `lg`                                                      |
| `token`    | -      | 비공개 파일 접근용 임시토큰 (`ft_` 접두어)                                         |

**인증 흐름:**

```
GET /v1/files/:uuid
 │
 ├─ file_meta.is_public == true → 인증 불필요 (바로 응답)
 │
 ├─ ?token=ft_xxx 있음
 │   ├─ 유효 + UUID 일치 → 응답
 │   └─ 무효/만료 → 401
 │
 ├─ Authorization 헤더 (JWT/API Key) → 인증 성공 시 응답
 │
 └─ 인증 없음 → 401
```

**요청 예시:**

```bash
# 공개 파일 — 브라우저에서 바로 보기
http://localhost:47200/v1/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890

# 공개 파일 — 강제 다운로드
http://localhost:47200/v1/files/a1b2c3d4-...?download=1

# 비공개 파일 — 임시토큰으로 접근
http://localhost:47200/v1/files/a1b2c3d4-...?token=ft_abc123...

# 캐시 방지 (타임스탬프 쿼리)
http://localhost:47200/v1/files/a1b2c3d4-...?download=1709140800
```

**응답 헤더:**

| 헤더                  | 값 (인라인)                           | 값 (?download)                        |
| --------------------- | ------------------------------------- | ------------------------------------- |
| `Content-Type`        | 파일 MIME 타입                        | 파일 MIME 타입                        |
| `Content-Disposition` | `inline; filename="photo.jpg"`        | `attachment; filename="photo.jpg"`    |
| `Cache-Control`       | `public, max-age=31536000, immutable` | `public, max-age=31536000, immutable` |

**에러 응답:**

| 상태 코드 | 원인                    |
| --------- | ----------------------- |
| `401`     | 비공개 파일 인증 실패   |
| `404`     | 파일 미존재 또는 삭제됨 |
| `500`     | 스토리지 읽기 실패      |

---

<a id="files-token"></a>

### 2. 임시토큰 발급

비공개 파일을 브라우저(GET)로 접근하기 위한 임시토큰을 발급합니다. `<img src>`, `<iframe src>` 등에서
Authorization 헤더를 보낼 수 없을 때 사용합니다.

**엔드포인트**: `POST /v1/files/token/:uuid`

**URL 파라미터:**

| 파라미터 | 필수 | 설명      |
| -------- | ---- | --------- |
| `:uuid`  | ✅   | 파일 UUID |

**요청 Body (JSON):**

| 필드  | 타입 | 기본값 | 설명                                                        |
| ----- | ---- | ------ | ----------------------------------------------------------- |
| `ttl` | int  | `300`  | 토큰 유효 시간 (초). 최대 3600초(1시간). 생략 시 300초(5분) |

**요청 예시:**

```bash
# 기본 TTL (5분)
curl -X POST http://localhost:47200/v1/files/token/a1b2c3d4-... \
  -H "Authorization: Bearer <TOKEN>"

# 사용자 지정 TTL (10분)
curl -X POST http://localhost:47200/v1/files/token/a1b2c3d4-... \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ttl": 600}'
```

**응답:**

```json
{
    "ok": true,
    "token": "ft_a1b2c3d4e5f6...(64자)",
    "expires_time": "2026-02-28 21:05:00",
    "url": "/v1/files/a1b2c3d4-...?token=ft_a1b2c3d4e5f6..."
}
```

> 시간 필드는 응답에서 `YYYY-MM-DD HH:MM:SS` 형식으로 반환됩니다.
> timezone은 `configs/server.json`의 `timezone`으로 설정하며,
> 미설정 시 서버 OS의 시스템 로컬 타임존을 따릅니다.
>
> 지원 형식:
>
> - IANA 타임존: [타임존 목록](../setup/timezone-list.md)
> - UTC 오프셋 직접 지정: `+0900`, `+09:00`, `-0530`, `-05:30`

**토큰 생명주기:**

| 속성        | 값                                                          |
| ----------- | ----------------------------------------------------------- |
| 형식        | `ft_` 접두어 + 32바이트 랜덤 hex (67자)                     |
| 기본 TTL    | 300초 (5분)                                                 |
| 최대 TTL    | 3600초 (1시간)                                              |
| 사용 횟수   | 무제한 (TTL 내 반복 접근 가능 — `<img src>` 등 재로드 대응) |
| UUID 바인딩 | 발급 시 지정한 UUID에만 사용 가능 (다른 파일 접근 불가)     |
| 저장 방식   | 인메모리 (sync.Map) — 서버 재시작 시 모든 토큰 만료         |
| 만료 정리   | 백그라운드 고루틴이 60초 간격으로 만료된 토큰 자동 제거     |

**에러 응답:**

| 상태 코드 | 원인                    |
| --------- | ----------------------- |
| `400`     | UUID 누락               |
| `404`     | 파일 미존재 또는 삭제됨 |
| `500`     | 토큰 생성 실패          |

---

<a id="files-upload"></a>

### 3. 파일 업로드

파일을 업로드하고 `file_meta` 시스템 엔티티에 메타데이터를 기록합니다.

**엔드포인트**: `POST /v1/files/:entity/upload`

**Content-Type**: `multipart/form-data`

**URL 파라미터:**

| 파라미터  | 필수 | 설명                  |
| --------- | ---- | --------------------- |
| `:entity` | ✅   | 첨부 대상 엔티티 이름 |

**Form 필드:**

| 필드         | 필수 | 설명                 |
| ------------ | ---- | -------------------- |
| `file`       | ✅   | 파일 데이터          |
| `field_name` | -    | 첨부 필드 이름       |
| `entity_seq` | -    | 첨부 대상 레코드 seq |

**Query 파라미터:**

| 파라미터    | 기본값  | 설명                                                 |
| ----------- | ------- | ---------------------------------------------------- |
| `dedup`     | `false` | `true` 시 동일 해시 파일 존재면 기존 레코드 반환     |
| `is_public` | `false` | `true` 시 공개 파일로 설정 (인증 없이 GET 접근 가능) |

**요청 예시:**

```bash
curl -X POST http://localhost:47200/v1/files/Employee/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@photo.jpg" \
  -F "field_name=profile_photo" \
  -F "entity_seq=42"
```

**처리 순서:**

1. 엔티티 존재 확인
2. 파일 수신 + SHA-256 해시 계산
3. 개별 파일 용량 제한 확인 (`max_file_size_mb`, 초과 시 413)
4. 중복 감지 (`dedup=true`일 때 `content_hash`로 기존 파일 검색)
5. UUID v4 생성
6. 이미지일 경우 EXIF 기반 자동 회전 (auto-orient)
7. 쿼터 확인 (초과 시 413)
8. 스토리지에 저장
9. `file_meta` 시스템 엔티티에 메타 기록
10. 이미지일 경우 썸네일 비동기 생성

**응답 (성공):**

```json
{
    "ok": true,
    "seq": 42,
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "data": {
        "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "original_name": "photo.jpg",
        "mime_type": "image/jpeg",
        "size": 1048576,
        "status": "active",
        "content_hash": "sha256:abc123..."
    }
}
```

**응답 (중복 감지 시):**

```json
{
    "ok": true,
    "seq": 42,
    "uuid": "a1b2c3d4-...",
    "dedup": true,
    "data": { ... }
}
```

**에러 응답:**

| 상태 코드 | 원인                           |
| --------- | ------------------------------ |
| `400`     | 파일 누락, 엔티티 미존재       |
| `413`     | 파일 크기 초과 또는 쿼터 초과  |
| `500`     | 스토리지 미설정 또는 저장 실패 |

---

<a id="files-download"></a>

### 4. 파일 다운로드

UUID로 파일을 다운로드합니다. API 클라이언트용으로, 항상 `Content-Disposition: attachment`로 응답합니다.
브라우저 인라인 뷰는 [GET /v1/files/:uuid](#files-view)를 사용하세요.

**엔드포인트**: `POST /v1/files/:entity/download/:uuid`

**URL 파라미터:**

| 파라미터  | 필수 | 설명        |
| --------- | ---- | ----------- |
| `:entity` | ✅   | 엔티티 이름 |
| `:uuid`   | ✅   | 파일 UUID   |

**Query 파라미터:**

| 파라미터 | 기본값 | 설명                          |
| -------- | ------ | ----------------------------- |
| `thumb`  | -      | 썸네일 크기: `sm`, `md`, `lg` |

**요청 예시:**

```bash
# 원본 다운로드
curl -X POST http://localhost:47200/v1/files/Employee/download/a1b2c3d4-... \
  -H "Authorization: Bearer <TOKEN>" -o photo.jpg

# 썸네일 다운로드
curl -X POST "http://localhost:47200/v1/files/Employee/download/a1b2c3d4-...?thumb=sm" \
  -H "Authorization: Bearer <TOKEN>" -o thumb.jpg
```

**응답 헤더:**

| 헤더                  | 값                                                            |
| --------------------- | ------------------------------------------------------------- |
| `Content-Type`        | 파일 MIME 타입                                                |
| `Content-Disposition` | `attachment; filename="original_name.ext"`                    |
| `Cache-Control`       | `public, max-age=31536000, immutable` (UUID 기반 → 변경 없음) |

> 요청한 `thumb` 크기의 썸네일이 없으면 원본을 반환합니다.

**에러 응답:**

| 상태 코드 | 원인                    |
| --------- | ----------------------- |
| `404`     | 파일 미존재 또는 삭제됨 |
| `500`     | 스토리지 읽기 실패      |

---

<a id="files-delete"></a>

### 5. 파일 삭제

파일, 썸네일, `file_meta` 레코드를 모두 삭제합니다.

**엔드포인트**: `POST /v1/files/:entity/delete/:uuid`

**URL 파라미터:**

| 파라미터  | 필수 | 설명        |
| --------- | ---- | ----------- |
| `:entity` | ✅   | 엔티티 이름 |
| `:uuid`   | ✅   | 파일 UUID   |

**요청 예시:**

```bash
curl -X POST http://localhost:47200/v1/files/Employee/delete/a1b2c3d4-... \
  -H "Authorization: Bearer <TOKEN>"
```

**응답:**

```json
{
    "ok": true
}
```

**에러 응답:**

| 상태 코드 | 원인               |
| --------- | ------------------ |
| `404`     | 파일 미존재        |
| `500`     | 스토리지 삭제 실패 |

---

<a id="files-list"></a>

### 6. 파일 목록

`file_meta` 레코드를 조회합니다. `seqs`로 특정 레코드를 직접 조회하거나, 빈 요청으로 전체 목록을 조회합니다.

**엔드포인트**: `POST /v1/files/:entity/list`

**URL 파라미터:**

| 파라미터  | 필수 | 설명        |
| --------- | ---- | ----------- |
| `:entity` | ✅   | 엔티티 이름 |

**요청 Body:**

```json
{
    "seqs": [1, 2, 3]
}
```

| 필드   | 타입    | 설명                                              |
| ------ | ------- | ------------------------------------------------- |
| `seqs` | int64[] | 조회할 `file_meta` seq 배열 (빈 배열 = 전체 목록) |

**요청 예시:**

```bash
curl -X POST http://localhost:47200/v1/files/Employee/list \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"seqs": [42, 43]}'
```

**응답:**

```json
{
    "ok": true,
    "items": [
        {
            "seq": 42,
            "uuid": "a1b2c3d4-...",
            "original_name": "photo.jpg",
            "mime_type": "image/jpeg",
            "size": 1048576,
            "status": "active"
        },
        {
            "seq": 43,
            "uuid": "e5f6a7b8-...",
            "original_name": "doc.pdf",
            "mime_type": "application/pdf",
            "size": 2097152,
            "status": "active"
        }
    ]
}
```

> **참고**: `entity_name`, `entity_seq`, `field_name`은 암호화된 데이터 필드에 저장되므로 SQL 검색 조건으로 사용할 수 없습니다.

---

<a id="files-meta"></a>

### 7. 파일 메타 조회

파일의 메타데이터만 조회합니다. 파일 본문은 다운로드하지 않습니다.

**엔드포인트**: `POST /v1/files/:entity/meta/:uuid`

**URL 파라미터:**

| 파라미터  | 필수 | 설명        |
| --------- | ---- | ----------- |
| `:entity` | ✅   | 엔티티 이름 |
| `:uuid`   | ✅   | 파일 UUID   |

**요청 예시:**

```bash
curl -X POST http://localhost:47200/v1/files/Employee/meta/a1b2c3d4-... \
  -H "Authorization: Bearer <TOKEN>"
```

**응답:**

```json
{
    "ok": true,
    "data": {
        "seq": 42,
        "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "original_name": "photo.jpg",
        "mime_type": "image/jpeg",
        "size": 1048576,
        "status": "active",
        "content_hash": "sha256:abc123...",
        "backup_status": "synced",
        "created_time": "2026-02-28 09:00:00",
        "updated_time": "2026-02-28 09:00:00"
    }
}
```

**에러 응답:**

| 상태 코드 | 원인        |
| --------- | ----------- |
| `404`     | 파일 미존재 |

---

## RBAC 권한

| 권한             | 설명           |
| ---------------- | -------------- |
| `files:token`    | 임시토큰 발급  |
| `files:upload`   | 파일 업로드    |
| `files:download` | 파일 다운로드  |
| `files:delete`   | 파일 삭제      |
| `files:list`     | 파일 목록 조회 |
| `files:meta`     | 메타 조회      |
| `files:*`        | 모든 파일 권한 |

---

## file_meta 시스템 엔티티

파일 메타데이터는 `file_meta` 시스템 엔티티에 저장됩니다.

### 인덱스 필드 (평문)

| 필드            | 타입        | 설명                                             |
| --------------- | ----------- | ------------------------------------------------ |
| `uuid`          | VARCHAR(36) | 파일 UUID (UNIQUE)                               |
| `size`          | BIGINT      | 파일 크기 (bytes)                                |
| `status`        | ENUM        | `pending`, `active`, `orphan`                    |
| `backup_status` | ENUM        | `none`, `pending`, `synced`, `failed`, `skipped` |
| `is_public`     | BOOLEAN     | 공개 파일 여부 (기본값 `false`, index_only)      |

### 암호화 필드 (data)

| 필드             | 설명                  |
| ---------------- | --------------------- |
| `original_name`  | 원본 파일명           |
| `storage_key`    | 스토리지 상대 경로    |
| `storage_path`   | 전체 경로             |
| `entity_name`    | 첨부 대상 엔티티 이름 |
| `entity_seq`     | 첨부 대상 레코드 seq  |
| `field_name`     | 첨부 필드 이름        |
| `mime_type`      | MIME 타입             |
| `content_hash`   | SHA-256 해시          |
| `backup_retries` | 백업 재시도 횟수      |

> 암호화 방식: XChaCha20-Poly1305. 암호화 키는 `license_scope` 설정에 따라 결정됩니다:
>
> - `license_scope: false` → `ENCRYPTION_KEY` 환경변수 (마스터 키)
> - `license_scope: true` (기본값) + `license_seq` 존재 → 해당 라이선스의 `secret_key` (per-license 키)
>
> 상세 규칙은 [시스템 엔티티 — 암호화 키 결정 규칙](../data/system-entities.md#11-암호화-키-결정-규칙)을 참조하세요.

---

## 관련 문서

- [관리자 라우트](admin-routes.md)
- [API 라우트](api-routes.md)
- [엔티티 라우트](entity-routes.md)
- [Join 가이드](join-routes.md)
- [SMTP 라우트](smtp-routes.md)

## 다음 문서

- [스토리지](../extensions/storage-guide.md)
- [시스템 엔티티](../data/system-entities.md)
- [운영 플레이북](../operations/operations-playbook.md)
- [목록으로 돌아가기](../README.md)
