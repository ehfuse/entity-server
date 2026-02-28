# Push API Routes

`/v1/push` 엔드포인트 상세 가이드입니다.

> Push API는 `configs/push.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [api-routes.md](api-routes.md)를 참조하세요.
- Push 설정, FCM/APNs 구성 등 운영 가이드는 [push-guide.md](../guides/extensions/push-guide.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                             | 메서드 | 경로                   | 인증    |
| --- | -------------------------------- | ------ | ---------------------- | ------- |
| 1   | [특정 유저 발송](#push-send)     | `POST` | `/v1/push/send`        | API Key |
| 2   | [전체 유저 발송](#push-send-all) | `POST` | `/v1/push/send-all`    | API Key |
| 3   | [발송 상태 조회](#push-status)   | `POST` | `/v1/push/status/:seq` | API Key |

> **참고**: 엔티티 훅을 통한 푸시 발송(`push_msg` insert)은 엔티티 CRUD API를 사용합니다.
> 자세한 내용은 [entity-routes.md](entity-routes.md)의 `POST /v1/entity/:entity/submit`을 참조하세요.

---

<a id="push-send"></a>

### 1. 특정 유저 발송

지정한 계정(들)에게 푸시 알림을 발송 큐에 등록합니다.
각 계정의 `push_enabled=true`인 디바이스로 개별 발송됩니다.

**엔드포인트**: `POST /v1/push/send`

**요청 본문**:

| 필드           | 타입                | 필수 | 설명                        |
| -------------- | ------------------- | ---- | --------------------------- |
| `account_seqs` | `int64[]`           | ✅   | 수신 계정 seq 배열          |
| `title`        | `string`            | ✅   | 알림 제목                   |
| `body`         | `string`            |      | 알림 본문                   |
| `data`         | `map[string]string` |      | 커스텀 페이로드 (key-value) |
| `ref_entity`   | `string`            |      | 참조 엔티티 이름            |
| `ref_seq`      | `int64`             |      | 참조 레코드 seq             |

**요청 예시**:

```bash
# 단일 유저에게 발송
curl -X POST http://localhost:47200/v1/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "account_seqs": [1],
    "title": "새 메시지",
    "body": "홍길동님이 메시지를 보냈습니다."
  }'

# 여러 유저에게 발송 + 커스텀 데이터
curl -X POST http://localhost:47200/v1/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "account_seqs": [1, 5, 12],
    "title": "공지사항",
    "body": "새 공지가 등록되었습니다.",
    "data": {
      "type": "notice",
      "notice_seq": "42"
    },
    "ref_entity": "notice",
    "ref_seq": 42
  }'
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "message": "queued",
    "enqueued": 3
}
```

`enqueued`는 실제 큐에 등록된 계정 수입니다. 각 계정의 디바이스 수에 따라 `push_log` 레코드 수는 더 많을 수 있습니다.

**에러 응답**:

| 코드 | 조건                                  |
| ---- | ------------------------------------- |
| 400  | `account_seqs` 누락 또는 `title` 누락 |

---

<a id="push-send-all"></a>

### 2. 전체 유저 발송

`push_enabled=true`인 디바이스를 보유한 **모든 계정**에게 푸시 알림을 발송합니다.
관리웹에서 전체 공지, 긴급 알림 등에 사용합니다.

**엔드포인트**: `POST /v1/push/send-all`

**요청 본문**:

| 필드         | 타입                | 필수 | 설명                        |
| ------------ | ------------------- | ---- | --------------------------- |
| `title`      | `string`            | ✅   | 알림 제목                   |
| `body`       | `string`            |      | 알림 본문                   |
| `data`       | `map[string]string` |      | 커스텀 페이로드 (key-value) |
| `ref_entity` | `string`            |      | 참조 엔티티 이름            |
| `ref_seq`    | `int64`             |      | 참조 레코드 seq             |

**요청 예시**:

```bash
# 전체 공지
curl -X POST http://localhost:47200/v1/push/send-all \
  -H "Content-Type: application/json" \
  -d '{
    "title": "시스템 점검 안내",
    "body": "2026-03-01 02:00~04:00 서버 점검이 예정되어 있습니다.",
    "data": {
      "type": "system",
      "action": "maintenance"
    }
  }'

# 긴급 알림 (참조 엔티티 포함)
curl -X POST http://localhost:47200/v1/push/send-all \
  -H "Content-Type: application/json" \
  -d '{
    "title": "긴급: 보안 업데이트",
    "body": "앱을 최신 버전으로 업데이트해주세요.",
    "data": {"type": "urgent"}
  }'
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "message": "queued",
    "enqueued": 150
}
```

`enqueued`는 푸시 가능한 계정 수입니다. `0`이면 발송 대상이 없습니다.

**에러 응답**:

| 코드 | 조건           |
| ---- | -------------- |
| 400  | `title` 누락   |
| 500  | 계정 조회 실패 |

> ⚠️ **주의**: 전체 발송은 모든 활성 디바이스에 알림을 보냅니다. 대량 발송 시 워커 큐가 포화될 수 있으므로 `push.json`의 `workers`와 `queue_size`를 충분히 설정하세요.

---

<a id="push-status"></a>

### 3. 발송 상태 조회

`push_log` 레코드의 발송 상태를 조회합니다.

**엔드포인트**: `POST /v1/push/status/:seq`

**URL 파라미터**:

| 파라미터 | 필수 | 설명           |
| -------- | ---- | -------------- |
| `:seq`   | ✅   | push_log의 seq |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/push/status/1
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "seq": 1,
    "message": "use entity API to query push_log for detailed status"
}
```

> **상세 조회**: `push_log` 엔티티에서 직접 조회하면 `status`, `retry_count`, `sent_time`, `error_message` 등 모든 필드를 확인할 수 있습니다:
>
> ```bash
> curl http://localhost:47200/v1/entity/push_log/1
> ```

**에러 응답**:

| 코드 | 조건              |
| ---- | ----------------- |
| 400  | 유효하지 않은 seq |

---

## Push 발송 흐름

```
관리웹 (POST /v1/push/send 또는 /send-all)
          │
          ▼
   PushHandler ──→ push.Service.EnqueueJob()
          │
          ▼  (디바이스별 push_log 생성)
   push_log (status=pending)
          │
          ▼  (dispatcher 5초 간격)
   CAS claim → processing
          │
          ▼
   Worker ──→ FCM / APNs
          │
          ▼
   push_log 상태 갱신 (sent / failed)
```

---

## 참고 문서

- [api-routes.md](api-routes.md) — 공통 인증, 에러 응답
- [push-guide.md](../guides/extensions/push-guide.md) — Push 설정, FCM/APNs 구성
- [entity-routes.md](entity-routes.md) — 엔티티 CRUD (`push_msg` insert로 발송)
- [smtp-routes.md](smtp-routes.md) — SMTP API (유사 패턴)
