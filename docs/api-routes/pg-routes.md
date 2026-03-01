# PG 결제 라우트

`/v1/pg` 엔드포인트 상세 가이드입니다.

> PG API는 `configs/extensions/pg.json`이 설정된 경우에만 활성화됩니다.

- 공통 인증 헤더 및 에러 응답 형식은 [API 라우트](api-routes.md)를 참조하세요.
- PG 설정, 프로바이더, 연동 방법 등 운영 가이드는 [PG 결제 가이드](../extensions/pg-guide.md)를 참조하세요.

<a id="summary"></a>

## 목록

| No. | 항목                               | 메서드 | 경로                            | 인증        |
| --- | ---------------------------------- | ------ | ------------------------------- | ----------- |
| 1   | [주문 생성](#pg-create-order)      | `POST` | `/v1/pg/orders`                 | JWT         |
| 2   | [주문 조회](#pg-get-order)         | `GET`  | `/v1/pg/orders/:orderId`        | JWT         |
| 3   | [결제 승인](#pg-confirm)           | `POST` | `/v1/pg/confirm`                | JWT         |
| 4   | [결제 취소](#pg-cancel)            | `POST` | `/v1/pg/orders/:orderId/cancel` | JWT         |
| 5   | [상태 동기화](#pg-sync)            | `POST` | `/v1/pg/orders/:orderId/sync`   | JWT         |
| 6   | [웹훅 수신](#pg-webhook)           | `POST` | `/v1/pg/webhook`                | 인증 불필요 |
| 7   | [클라이언트 설정 조회](#pg-config) | `GET`  | `/v1/pg/config`                 | 인증 불필요 |

---

<a id="pg-create-order"></a>

### 1. 주문 생성

결제 전 서버에 주문을 등록합니다. 반환된 `order_id`를 결제창 SDK에 전달합니다.

**엔드포인트**: `POST /v1/pg/orders`

**요청 본문**:

| 필드             | 타입     | 필수 | 설명                                      |
| ---------------- | -------- | ---- | ----------------------------------------- |
| `amount`         | `int64`  | ✅   | 결제 금액 (원 단위)                       |
| `order_name`     | `string` | ✅   | 주문명                                    |
| `currency`       | `string` |      | 통화 (기본값: `KRW`)                      |
| `customer_name`  | `string` |      | 구매자 이름                               |
| `customer_email` | `string` |      | 구매자 이메일                             |
| `provider`       | `string` |      | PG 프로바이더 (미지정 시 기본 프로바이더) |
| `metadata`       | `object` |      | 커스텀 추가 데이터 (자유 형식)            |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/pg/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 15000,
    "order_name": "프리미엄 구독 1개월",
    "customer_name": "홍길동",
    "customer_email": "user@example.com"
  }'
```

**성공 응답** (`201`):

```json
{
    "ok": true,
    "data": {
        "order_id": "ORD-20241201-A1B2C3",
        "amount": 15000,
        "order_name": "프리미엄 구독 1개월",
        "status": "created",
        "provider": "toss_payments",
        "currency": "KRW"
    }
}
```

**오류 응답**:

| 코드 | 원인                            |
| ---- | ------------------------------- |
| 400  | 필수 필드 누락 또는 유효성 오류 |

↑ [목록으로 이동](#summary)

---

<a id="pg-get-order"></a>

### 2. 주문 조회

`order_id`로 주문 상태를 조회합니다.

**엔드포인트**: `GET /v1/pg/orders/:orderId`

**경로 파라미터**:

| 파라미터  | 설명    |
| --------- | ------- |
| `orderId` | 주문 ID |

**요청 예시**:

```bash
curl http://localhost:47200/v1/pg/orders/ORD-20241201-A1B2C3 \
  -H "Authorization: Bearer <token>"
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "order_id": "ORD-20241201-A1B2C3",
        "status": "done",
        "amount": 15000,
        "payment_key": "twid_...",
        "provider": "toss_payments",
        "approved_at": "2024-12-01 10:30:00"
    }
}
```

**오류 응답**:

| 코드 | 원인      |
| ---- | --------- |
| 404  | 주문 없음 |

↑ [목록으로 이동](#summary)

---

<a id="pg-confirm"></a>

### 3. 결제 승인

클라이언트 SDK에서 결제가 완료된 후 서버에서 최종 승인을 요청합니다.

> **중요**: `amount`는 서버에 등록된 주문 금액과 반드시 일치해야 합니다. 불일치 시 결제가 거부됩니다.

**엔드포인트**: `POST /v1/pg/confirm`

**요청 본문**:

| 필드          | 타입     | 필수 | 설명                                |
| ------------- | -------- | ---- | ----------------------------------- |
| `payment_key` | `string` | ✅   | PG사에서 발급한 결제 키             |
| `order_id`    | `string` | ✅   | 서버에서 생성한 주문 ID             |
| `amount`      | `int64`  | ✅   | 결제 금액 (주문 금액과 동일해야 함) |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/pg/confirm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_key": "twid_xxxxxxxxxxxx",
    "order_id": "ORD-20241201-A1B2C3",
    "amount": 15000
  }'
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "data": {
        "paymentKey": "twid_xxxxxxxxxxxx",
        "orderId": "ORD-20241201-A1B2C3",
        "orderName": "프리미엄 구독 1개월",
        "status": "DONE",
        "method": "카드",
        "totalAmount": 15000,
        "approvedAt": "2024-12-01T10:30:00+09:00",
        "card": {
            "number": "123456**********",
            "installmentPlanMonths": 0,
            "cardType": "신용",
            "issuerCode": "11"
        }
    }
}
```

**오류 응답**:

| 코드 | 원인                            |
| ---- | ------------------------------- |
| 400  | 필수 필드 누락 또는 금액 불일치 |
| 404  | 주문 없음                       |
| 409  | 이미 승인 완료 또는 취소된 주문 |
| 502  | PG사 API 오류                   |

↑ [목록으로 이동](#summary)

---

<a id="pg-cancel"></a>

### 4. 결제 취소

승인 완료된 결제를 전액 또는 부분 취소합니다.

**엔드포인트**: `POST /v1/pg/orders/:orderId/cancel`

**경로 파라미터**:

| 파라미터  | 설명    |
| --------- | ------- |
| `orderId` | 주문 ID |

**요청 본문**:

| 필드             | 타입     | 필수 | 설명                                       |
| ---------------- | -------- | ---- | ------------------------------------------ |
| `cancel_reason`  | `string` | ✅   | 취소 사유                                  |
| `cancel_amount`  | `int64`  |      | 부분 취소 금액 (미지정 시 전액 취소)       |
| `refund_account` | `object` |      | 가상계좌 환불 계좌 정보 (가상계좌 결제 시) |

**`refund_account` 필드**:

| 필드            | 타입     | 필수 | 설명        |
| --------------- | -------- | ---- | ----------- |
| `bank`          | `string` | ✅   | 은행 코드   |
| `accountNumber` | `string` | ✅   | 계좌번호    |
| `holderName`    | `string` | ✅   | 예금주 이름 |

**요청 예시**:

```bash
# 전액 취소
curl -X POST http://localhost:47200/v1/pg/orders/ORD-20241201-A1B2C3/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_reason": "고객 요청"
  }'

# 부분 취소 (5,000원)
curl -X POST http://localhost:47200/v1/pg/orders/ORD-20241201-A1B2C3/cancel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_reason": "일부 상품 반품",
    "cancel_amount": 5000
  }'
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "data": {
        "status": "CANCELED",
        "totalAmount": 15000,
        "balanceAmount": 0,
        "cancels": [
            {
                "cancelReason": "고객 요청",
                "cancelAmount": 15000,
                "canceledAt": "2024-12-01T11:00:00+09:00",
                "cancelStatus": "DONE"
            }
        ]
    }
}
```

**오류 응답**:

| 코드 | 원인                                 |
| ---- | ------------------------------------ |
| 400  | cancel_reason 누락                   |
| 404  | 주문 없음                            |
| 409  | 취소 불가 상태 (미승인, 이미 취소됨) |
| 502  | PG사 API 오류                        |

↑ [목록으로 이동](#summary)

---

<a id="pg-sync"></a>

### 5. 상태 동기화

PG사에 직접 조회하여 주문 상태를 최신화합니다. 웹훅 수신 실패 또는 가상계좌 입금 확인 등에 활용합니다.

**엔드포인트**: `POST /v1/pg/orders/:orderId/sync`

**경로 파라미터**:

| 파라미터  | 설명    |
| --------- | ------- |
| `orderId` | 주문 ID |

**요청 예시**:

```bash
curl -X POST http://localhost:47200/v1/pg/orders/ORD-20241201-A1B2C3/sync \
  -H "Authorization: Bearer <token>"
```

**성공 응답** (`200`):

```json
{
    "ok": true,
    "data": {
        "status": "DONE",
        "totalAmount": 15000,
        "method": "가상계좌",
        "virtualAccount": {
            "accountNumber": "12345678901234",
            "bankCode": "20",
            "settlementStatus": "COMPLETED"
        }
    }
}
```

**오류 응답**:

| 코드 | 원인             |
| ---- | ---------------- |
| 404  | 주문 없음        |
| 409  | payment_key 없음 |
| 502  | PG사 API 오류    |

↑ [목록으로 이동](#summary)

---

<a id="pg-webhook"></a>

### 6. 웹훅 수신

PG사에서 결제 상태 변경(가상계좌 입금 등) 시 서버로 전송하는 콜백을 수신합니다.

> **인증 불필요** — PG사 대시보드에 이 URL을 등록하세요.  
> 처리 결과와 무관하게 항상 `200 OK`를 반환합니다.

**엔드포인트**: `POST /v1/pg/webhook`

**요청 헤더** (PG사 → 서버):

| 헤더                  | 설명                      |
| --------------------- | ------------------------- |
| `X-Webhook-Signature` | 웹훅 서명 (Toss Payments) |

**응답** (`200`):

```json
{ "ok": true }
```

↑ [목록으로 이동](#summary)

---

<a id="pg-config"></a>

### 7. 클라이언트 설정 조회

프론트엔드 SDK 초기화에 필요한 공개 키를 반환합니다.

> **인증 불필요** — 클라이언트/앱에서 직접 호출합니다.

**엔드포인트**: `GET /v1/pg/config`

**쿼리 파라미터**:

| 파라미터   | 설명                                   |
| ---------- | -------------------------------------- |
| `provider` | 프로바이더 (미지정 시 기본 프로바이더) |

**요청 예시**:

```bash
curl http://localhost:47200/v1/pg/config
curl http://localhost:47200/v1/pg/config?provider=toss_payments
```

**응답** (`200`):

```json
{
    "ok": true,
    "data": {
        "provider": "toss_payments",
        "client_key": "test_ck_...",
        "success_url": "https://your-app.com/payment/success",
        "fail_url": "https://your-app.com/payment/fail"
    }
}
```

↑ [목록으로 이동](#summary)

---

## 결제 상태값

| 상태               | 설명                               |
| ------------------ | ---------------------------------- |
| `created`          | 주문 생성됨 (아직 결제 시도 전)    |
| `in_progress`      | 결제 진행 중 (SDK 호출 후 승인 전) |
| `done`             | 결제 승인 완료                     |
| `canceled`         | 전액 취소                          |
| `partial_canceled` | 부분 취소                          |
| `aborted`          | 결제 실패/승인 거부                |
| `expired`          | 만료 (가상계좌 미입금 등)          |

## 오류 코드 체계

| HTTP | 의미                                                  |
| ---- | ----------------------------------------------------- |
| 400  | 클라이언트 오류 (필수 필드 누락, 금액 불일치 등)      |
| 404  | 주문 없음                                             |
| 409  | 상태 충돌 (이미 승인됨, 이미 취소됨 등)               |
| 502  | PG사 API 오류 (응답 `code` 필드에 PG사 오류코드 포함) |

**502 오류 응답 예시**:

```json
{
    "ok": false,
    "code": "NOT_FOUND_PAYMENT",
    "message": "존재하지 않는 결제 정보입니다."
}
```

## 지원 PG사

| 드라이버      | PG사         | `pg.json` driver 값 |
| ------------- | ------------ | ------------------- |
| Toss Payments | 토스페이먼츠 | `toss_payments`     |
| NHN KCP       | NHN KCP      | `kcp`               |
| KG 이니시스   | KG 이니시스  | `inicis`            |
| 다날          | 다날         | `danal`             |
| 헥토파이낸셜  | 헥토파이낸셜 | `hecto`             |
| 워너페이먼츠  | 워너페이먼츠 | `wanna`             |

## 관련 문서

- [PG 결제 가이드](../extensions/pg-guide.md)
- [API 라우트](api-routes.md)
