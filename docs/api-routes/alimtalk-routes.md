# 알림톡·친구톡 라우트

`/v1/alimtalk`, `/v1/friendtalk` 엔드포인트 상세 가이드입니다.

> 알림톡/친구톡 API는 `configs/alimtalk.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                                          | 메서드 | 경로                                | 인증        |
| --- | --------------------------------------------- | ------ | ----------------------------------- | ----------- |
| 1   | [알림톡 발송](#alimtalk-send)                 | `POST` | `/v1/alimtalk/send`                 | API Key     |
| 2   | [발송 상태 조회](#alimtalk-status)            | `GET`  | `/v1/alimtalk/status/:seq`          | API Key     |
| 3   | [템플릿 목록](#alimtalk-templates)            | `GET`  | `/v1/alimtalk/templates`            | API Key     |
| 4   | [발송 결과 콜백](#alimtalk-webhook)           | `POST` | `/v1/alimtalk/webhook/:provider`    | 인증 불필요 |
| 5   | [친구톡 발송](#friendtalk-send)               | `POST` | `/v1/friendtalk/send`               | API Key     |

---

<a id="alimtalk-send"></a>

### 1. 알림톡 발송

카카오 알림톡을 발송 큐에 등록합니다. 실제 발송은 워커가 비동기로 처리합니다.

**엔드포인트**: `POST /v1/alimtalk/send`

**요청 본문**:

| 필드            | 타입                | 필수 | 설명                                           |
| --------------- | ------------------- | ---- | ---------------------------------------------- |
| `template_code` | `string`            | ✅   | 카카오 알림톡 템플릿 코드                      |
| `receiver`      | `string`            | ✅   | 수신자 전화번호 (`01012345678` 형식)           |
| `variables`     | `map[string]string` |      | 템플릿 변수 (`#{변수명}` 바인딩)               |
| `provider`      | `string`            |      | 프로바이더 키 (미지정 시 기본 프로바이더)      |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/alimtalk/send \
  -H "Content-Type: application/json" \
  -d '{
    "template_code": "ORDER_COMPLETE",
    "receiver": "01012345678",
    "variables": {
      "주문번호": "ORD-001",
      "상품명": "프리미엄 구독",
      "금액": "15,000원"
    }
  }'
```

**성공 응답** (`202`):

```json
{
  "message": "alimtalk queued"
}
```

↑ [목록으로 이동](#summary)

---

<a id="alimtalk-status"></a>

### 2. 발송 상태 조회

`alimtalk_log` seq로 발송 상태를 확인합니다.

**엔드포인트**: `GET /v1/alimtalk/status/:seq`

> 상세 이력은 엔티티 API로 `alimtalk_log` 엔티티를 직접 조회하는 것을 권장합니다.

↑ [목록으로 이동](#summary)

---

<a id="alimtalk-templates"></a>

### 3. 템플릿 목록

`configs/alimtalk.json`에 등록된 알림톡 템플릿 목록을 반환합니다.

**엔드포인트**: `GET /v1/alimtalk/templates`

**성공 응답** (`200`):

```json
{
  "templates": [
    {
      "code": "ORDER_COMPLETE",
      "name": "주문완료",
      "variables": ["주문번호", "상품명", "금액"]
    }
  ],
  "count": 1
}
```

↑ [목록으로 이동](#summary)

---

<a id="alimtalk-webhook"></a>

### 4. 발송 결과 콜백

각 프로바이더가 발송 결과를 POST로 전달하는 콜백 엔드포인트입니다.  
수신 시 `alimtalk_log.status`를 `delivered` 또는 `failed`로 갱신합니다.

> **인증 불필요** — 각 프로바이더 대시보드에 이 URL을 등록하세요.  
> 처리 결과와 무관하게 항상 `200 OK`를 반환합니다.

**엔드포인트**: `POST /v1/alimtalk/webhook/:provider`

**경로 파라미터**:

| 값           | 프로바이더     |
| ------------ | -------------- |
| `aligo`      | 알리고         |
| `solapi`     | Solapi(CoolSMS) |
| `ppurio`     | 뿌리오         |
| `nhn_cloud`  | NHN Cloud      |

**응답** (`200`):

```
OK
```

↑ [목록으로 이동](#summary)

---

<a id="friendtalk-send"></a>

### 5. 친구톡 발송

카카오 친구톡(브랜드 메시지)을 발송 큐에 등록합니다.

**엔드포인트**: `POST /v1/friendtalk/send`

**요청 본문**:

| 필드           | 타입       | 필수 | 설명                                                           |
| -------------- | ---------- | ---- | -------------------------------------------------------------- |
| `receiver`     | `string`   | ✅   | 수신자 전화번호                                                |
| `content`      | `string`   | ✅   | 메시지 본문                                                    |
| `msg_type`     | `string`   |      | 메시지 유형: `text`(기본), `image`, `wide_image`, `wide_item_list`, `carousel` |
| `image_url`    | `string`   |      | 이미지 URL (image 타입)                                        |
| `image_link`   | `string`   |      | 이미지 클릭 링크                                               |
| `is_ad`        | `bool`     |      | 광고성 메시지 여부 (기본값: `true`)                            |
| `buttons`      | `object[]` |      | 버튼 목록 (최대 5개)                                           |
| `header`       | `string`   |      | 헤더 텍스트 (와이드 아이템리스트)                              |
| `items_json`   | `string`   |      | 아이템 목록 JSON (와이드 아이템리스트)                         |
| `carousel_json`| `string`   |      | 캐러셀 데이터 JSON                                             |
| `provider`     | `string`   |      | 프로바이더 키                                                  |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/friendtalk/send \
  -H "Content-Type: application/json" \
  -d '{
    "receiver": "01012345678",
    "content": "신규 이벤트가 시작되었습니다!",
    "msg_type": "image",
    "image_url": "https://your-cdn.com/event.jpg",
    "image_link": "https://your-app.com/event",
    "is_ad": false
  }'
```

**성공 응답** (`202`):

```json
{
  "message": "friendtalk queued"
}
```

↑ [목록으로 이동](#summary)

---

## 발송 상태값

| 상태          | 설명                             |
| ------------- | -------------------------------- |
| `pending`     | 발송 대기중                      |
| `processing`  | 워커가 처리중                    |
| `sent`        | 프로바이더 API 전송 완료         |
| `delivered`   | 프로바이더 수신 확인 콜백 수신   |
| `failed`      | 발송 실패                        |
| `expired`     | 만료됨                           |

## 관련 문서

- [API 라우트](api-routes.md)
