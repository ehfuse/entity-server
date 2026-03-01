# PG 결제 가이드

> Entity Server PG (Payment Gateway) 결제 설정 및 사용법

---

## 목차

1. [빠른 시작](#1-빠른-시작)
2. [설정 파일 (pg.json)](#2-설정-파일-pgjson)
3. [프로바이더](#3-프로바이더)
4. [결제 흐름 (단건결제)](#4-결제-흐름-단건결제)
5. [API 레퍼런스](#5-api-레퍼런스)
6. [결제 취소 / 환불](#6-결제-취소--환불)
7. [웹훅 수신](#7-웹훅-수신)
8. [시스템 엔티티](#8-시스템-엔티티)
9. [Hook 연동](#9-hook-연동)
10. [클라이언트 연동 예시](#10-클라이언트-연동-예시)
11. [보안 권장사항](#11-보안-권장사항)
12. [상태 코드 및 에러 처리](#12-상태-코드-및-에러-처리)
13. [운영 참고사항](#13-운영-참고사항)

---

## 1) 빠른 시작

### 1-1. 최소 설정

`configs/` 디렉터리에 `pg.json` 파일을 생성합니다. Toss Payments만 사용하는 최소 설정:

```json
{
    "enabled": true,
    "default": "toss_payments",
    "webhook_secret": "${PG_WEBHOOK_SECRET}",
    "providers": [
        {
            "driver": "toss_payments",
            "client_key": "${TOSS_CLIENT_KEY}",
            "secret_key": "${TOSS_SECRET_KEY}"
        }
    ]
}
```

### 1-2. 엔티티 배치

PG 기능을 사용하려면 다음 시스템 엔티티가 `entities/System/Payment/` 디렉터리에 있어야 합니다:

| 엔티티           | 파일명                | 역할           |
| ---------------- | --------------------- | -------------- |
| `pg_order`       | `pg_order.json`       | 주문/결제 정보 |
| `pg_cancel`      | `pg_cancel.json`      | 취소/환불 이력 |
| `pg_webhook_log` | `pg_webhook_log.json` | 웹훅 수신 로그 |

> 이 엔티티들은 기본 배포에 포함되어 있습니다. PG 기능이 활성화되면 서버 시작 시 자동으로 존재 여부를 검증합니다.

### 1-3. 환경 변수

`.env` 또는 시스템 환경 변수로 시크릿 키를 설정합니다:

```bash
# Toss Payments
TOSS_CLIENT_KEY=test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm
TOSS_SECRET_KEY=test_gsk_docs_OaPz8L5KdmQXkzJ59P0vlemYq7gg

# 웹훅 시크릿 (임의의 문자열)
PG_WEBHOOK_SECRET=my-webhook-secret-key
```

### 1-4. 결제 테스트

**1단계: 주문 생성**

```bash
curl -X POST http://localhost:3000/v1/pg/orders \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "order_name": "토스 티셔츠 외 2건",
    "customer_name": "김토스",
    "customer_email": "customer@email.com"
  }'
```

응답:

```json
{
    "ok": true,
    "data": {
        "order_id": "ORD_1709123456789_aB3x",
        "amount": 50000,
        "order_name": "토스 티셔츠 외 2건",
        "status": "created",
        "client_key": "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
        "success_url": "/payment/success",
        "fail_url": "/payment/fail"
    }
}
```

**2단계: 결제 승인** (클라이언트에서 PG SDK 인증 완료 후)

```bash
curl -X POST http://localhost:3000/v1/pg/confirm \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_key": "5EnNZRJGvaBX7zk2yd8ydw26XvwXkLrx9POLqKQjmAw4b0e1",
    "order_id": "ORD_1709123456789_aB3x",
    "amount": 50000
  }'
```

응답:

```json
{
    "ok": true,
    "data": {
        "status": "done",
        "payment_key": "5EnNZRJGvaBX7zk2yd8ydw26XvwXkLrx9POLqKQjmAw4b0e1",
        "order_id": "ORD_1709123456789_aB3x",
        "total_amount": 50000,
        "balance_amount": 50000,
        "method": "카드",
        "approved_time": "2026-03-01T12:18:14+09:00",
        "receipt_url": "https://dashboard.tosspayments.com/receipt/..."
    }
}
```

---

## 2) 설정 파일 (pg.json)

### 2-1. 파일 위치

서버의 `configs/extensions/` 디렉터리에 `pg.json`으로 저장합니다.

> **참고:** `configs-example/extensions/pg.json.example`에 전체 옵션이 포함된 참조 템플릿이 있습니다.

### 2-2. 전체 구조

```json
{
    "enabled": true,
    "default": "toss_payments",
    "webhook_secret": "${PG_WEBHOOK_SECRET}",
    "order_id_prefix": "ORD",
    "success_url": "/payment/success",
    "fail_url": "/payment/fail",
    "webhook_url": "/v1/pg/webhook",
    "amount_limit": {
        "min": 100,
        "max": 10000000
    },
    "workers": 2,
    "providers": [
        {
            "driver": "toss_payments",
            "client_key": "${TOSS_CLIENT_KEY}",
            "secret_key": "${TOSS_SECRET_KEY}",
            "api_url": "https://api.tosspayments.com",
            "api_version": "2022-11-16"
        },
        {
            "driver": "kcp",
            "site_cd": "${KCP_SITE_CD}",
            "secret_key": "${KCP_SECRET_KEY}",
            "api_url": "https://api.pay.kcp.co.kr"
        },
        {
            "driver": "inicis",
            "store_id": "${INICIS_STORE_ID}",
            "sign_key": "${INICIS_SIGN_KEY}",
            "api_url": "https://api.inicis.com"
        }
    ]
}
```

### 2-3. 필드 상세

#### 최상위

| 필드              | 타입   | 기본값             | 설명                            |
| ----------------- | ------ | ------------------ | ------------------------------- |
| `enabled`         | bool   | `false`            | PG 결제 기능 활성화             |
| `default`         | string | —                  | 기본 프로바이더 드라이버명      |
| `webhook_secret`  | string | `""`               | 웹훅 서명 검증용 시크릿         |
| `order_id_prefix` | string | `"ORD"`            | 주문 ID 접두어                  |
| `success_url`     | string | `/payment/success` | 결제 성공 리다이렉트 URL        |
| `fail_url`        | string | `/payment/fail`    | 결제 실패 리다이렉트 URL        |
| `webhook_url`     | string | `/v1/pg/webhook`   | PG사 대시보드에 등록할 웹훅 URL |
| `workers`         | int    | `2`                | 웹훅 처리 워커 수               |

#### amount_limit (금액 제한)

| 필드  | 타입  | 기본값       | 설명                |
| ----- | ----- | ------------ | ------------------- |
| `min` | int64 | `100`        | 최소 결제 금액 (원) |
| `max` | int64 | `10,000,000` | 최대 결제 금액 (원) |

#### providers (프로바이더 배열)

| 필드             | 타입   | 설명                                         | 대상          |
| ---------------- | ------ | -------------------------------------------- | ------------- |
| `driver`         | string | 프로바이더 식별자                            | 공통          |
| `client_key`     | string | 클라이언트 키 (SDK용 공개 키)                | Toss          |
| `secret_key`     | string | 서버 API 인증용 비밀 키                      | Toss, KCP     |
| `api_url`        | string | API 기본 URL                                 | 공통          |
| `api_version`    | string | API 버전                                     | Toss          |
| `webhook_secret` | string | 프로바이더별 웹훅 시크릿 (오버라이드)        | 공통          |
| `site_cd`        | string | 사이트 코드                                  | KCP           |
| `store_id`       | string | 상점 ID                                      | 이니시스      |
| `sign_key`       | string | 서명 키                                      | 이니시스      |
| `mid`            | string | 상점 MID                                     | KCP, 이니시스 |
| `merchant_key`   | string | 가맹점 키                                    | KCP, 이니시스 |
| `merchant_id`    | string | 가맹점 ID                                    | 헥토파이낸셜  |
| `cp_id`          | string | CPID (가맹점 식별자, 요청 body의 merchantId) | 다날          |
| `cp_key`         | string | CP Key (현재 미사용 — 레거시 필드)           | 다날          |

> **`${ENV_VAR}`** 패턴은 서버 시작 시 환경 변수로 자동 치환됩니다.

---

## 3) 프로바이더

### 3-1. 지원 프로바이더

| 프로바이더    | 드라이버명      | 상태    | API 명세    | 비고                                                                                                                                |
| ------------- | --------------- | ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Toss Payments | `toss_payments` | ✅ 구현 | ✅ 공식문서 | V2 API, REST, 테스트 환경 우수                                                                                                      |
| NHN KCP       | `kcp`           | ✅ 구현 | ✅ 공식문서 | 국내 대형 PG사                                                                                                                      |
| KG 이니시스   | `inicis`        | ✅ 구현 | ✅ 공식문서 | 국내 대형 PG사                                                                                                                      |
| 다날          | `danal`         | ✅ 구현 | ✅ 공식문서 | Basic Auth (`base64(secretKey+":")`), ONE API                                                                                       |
| 헥토파이낸셜  | `hecto`         | ✅ 구현 | ✅ 공식문서 | AES-256/ECB + SHA-256 pktHash, Non-UI API — [연동 명세서](https://develop.sbsvc.online/16/onlineDocList.do)                         |
| 워너페이먼츠  | `wanna`         | ✅ 구현 | ⚠️ 추정구현 | Bearer 토큰 인증 — 실제 연동 전 명세 확인 필요                                                                                      |
| 네이버페이    | `naverpay`      | ✅ 구현 | ✅ 공식문서 | 헤더 인증(X-Naver-\*), 단건결제 SDK 방식 — [공식 문서](https://docs.pay.naver.com/docs/onetime-payment/onetime-payment-overview)    |
| 페이코        | `payco`         | ✅ 구현 | ⚠️ 추정구현 | sellerKey 인증, crossplatform.payco.com — 실제 연동 전 공식 명세 확인 필요                                                          |
| 카카오페이    | `kakaopay`      | ✅ 구현 | ✅ 공식문서 | `SECRET_KEY` 헤더 인증, 2단계 결제(ready→approve) — [공식 문서](https://developers.kakaopay.com/docs/payment/online/single-payment) |

### 3-2. Toss Payments 설정

가장 권장되는 프로바이더입니다. [Toss Payments 개발자센터](https://developers.tosspayments.com)에서 테스트 키를 발급받습니다.

```json
{
    "driver": "toss_payments",
    "client_key": "${TOSS_CLIENT_KEY}",
    "secret_key": "${TOSS_SECRET_KEY}",
    "api_url": "https://api.tosspayments.com",
    "api_version": "2022-11-16"
}
```

**인증 방식**: Basic Auth — `base64(secret_key + ":")`

| 키         | 용도                                  | 노출 가능 여부 |
| ---------- | ------------------------------------- | -------------- |
| client_key | 클라이언트 SDK 초기화 (결제창 띄우기) | ✅ 공개 가능   |
| secret_key | 서버 간 API 호출 (승인, 취소, 조회)   | ❌ 절대 비공개 |

**테스트 키 구분:**

- `test_gck_*` — 테스트 클라이언트 키
- `test_gsk_*` — 테스트 시크릿 키
- `live_gck_*` / `live_gsk_*` — 운영 키

### 3-3. NHN KCP 설정

```json
{
    "driver": "kcp",
    "site_cd": "${KCP_SITE_CD}",
    "secret_key": "${KCP_SECRET_KEY}",
    "api_url": "https://api.pay.kcp.co.kr"
}
```

**인증 방식**: `Secret` + secretKey 헤더

### 3-4. KG 이니시스 설정

```json
{
    "driver": "inicis",
    "store_id": "${INICIS_STORE_ID}",
    "sign_key": "${INICIS_SIGN_KEY}",
    "api_url": "https://api.inicis.com"
}
```

**인증 방식**: `SignKey` 헤더

### 3-5. 다날 설정

[다날 개발자센터](https://developers.danalpay.com/reference/server/confirm)에서 API 명세를 확인하세요.

```json
{
    "driver": "danal",
    "cp_id": "${DANAL_CP_ID}",
    "secret_key": "${DANAL_SECRET_KEY}"
}
```

**인증 방식**: HTTP Basic Auth

```
Authorization: Basic base64(secretKey + ":")
```

| 키           | 용도                                                  |
| ------------ | ----------------------------------------------------- |
| `cp_id`      | 다날로부터 발급받은 CPID (요청 body의 merchantId)     |
| `secret_key` | Basic Auth 자격증명 (secretKey)                       |
| `api_url`    | API Base URL (기본값: `https://one-api.danalpay.com`) |

> **엔드포인트**
>
> - 승인: `POST /payments/confirm`
> - 취소: `POST /payments/cancel`
> - 조회: 공개 미제공 — 다날 기술지원팀(developer@danal.co.kr) 문의
>
> **성공 판별**: `code == "SUCCESS"`
>
> **결제수단 필드**: 승인·취소 요청에 `method` 값을 전달해야 합니다 (CARD, MOBILE, TRANSFER, VACCOUNT 등).
> 결제창 인증 완료 시 콜백으로 전달되는 값을 그대로 사용하세요.
>
> **부분 취소**: `cancelType: "P"`, 전액 취소: `cancelType: "C"`

### 3-6. 헥토파이낸셜 설정

[헥토파이낸셜 표준 연동규격서](https://develop.sbsvc.online/16/onlineDocList.do)를 참고하세요.

```json
{
    "driver": "hecto",
    "merchant_id": "${HECTO_MID}",
    "sign_key": "${HECTO_HASH_KEY}",
    "aes_key": "${HECTO_AES_KEY}",
    "api_url": "https://gw.settlebank.co.kr"
}
```

| 키            | 용도                                  | 기본값                        |
| ------------- | ------------------------------------- | ----------------------------- |
| `merchant_id` | 헥토 상점 아이디 (mchtId)             | 필수                          |
| `sign_key`    | pktHash 위변조 방지 인증 키 (hashKey) | 필수                          |
| `aes_key`     | AES-256 암호화 키 (32바이트 ASCII)    | 테스트용 공용 키 사용         |
| `api_url`     | Non-UI API URL                        | `https://gw.settlebank.co.kr` |

**보안 방식**

| 구분            | 알고리즘                          | 용도                |
| --------------- | --------------------------------- | ------------------- |
| 중요정보 암호화 | AES-256/ECB/PKCS5Padding + Base64 | 금액, 개인정보 필드 |
| 위변조 방지     | SHA-256 + Hex 인코딩              | pktHash 생성        |

**pktHash 공식 (취소 기준)**

```
pktHash = SHA256(취소요청일자 + 취소요청시간 + 상점아이디 + 상점주문번호 + 취소금액(평문) + hashKey)
```

**엔드포인트**

- 결제창(UI): `https://npg.settlebank.co.kr` (테스트: `tbnpg.settlebank.co.kr`)
- Non-UI API: `https://gw.settlebank.co.kr` (테스트: `tbgw.settlebank.co.kr`)
    - 취소: `POST /spay/APICancel.do`
    - 조회: `POST https://nspay.settlebank.co.kr/api/pg/{mchtId}/transInfo.do`

**테스트 키 (단순 연동 테스트용)**

```
AES 키:  pgSettle30y739r82jtd709yOfZ2yK5K
Hash 키: ST1009281328226982205
```

> **성공 판별**: `params.outStatCd == "0021"`
>
> **결제수단 코드**: CA(신용카드), RA(계좌이체), VA(가상계좌), MP(휴대폰결제), PZ(간편결제)
>
> **노티(noti) 응답**: 결제 완료 시 `notiUrl`로 POST 전송 → `"OK"` 응답 필요

### 3-7. 워너페이먼츠 설정

```json
{
    "driver": "wanna",
    "secret_key": "${WANNA_SECRET_KEY}",
    "api_url": "https://api.wannapayments.co.kr"
}
```

**인증 방식**: `Authorization: Bearer <secret_key>`

> 성공 판별: `resultCode == "0000"`

### 3-8. 네이버페이 설정

공식 문서: [네이버페이 개발자센터](https://docs.pay.naver.com/docs/onetime-payment/onetime-payment-overview)

**필드 매핑** (`PgProviderConfig`):

| 설정 필드    | 의미                          | 비고                                                                             |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------- |
| `client_key` | X-Naver-Client-Id             | 가맹점 클라이언트 ID (public)                                                    |
| `secret_key` | X-Naver-Client-Secret         | 가맹점 시크릿 키                                                                 |
| `mid`        | X-NaverPay-Chain-Id           | 가맹점 체인 ID                                                                   |
| `api_url`    | API 도메인 (기본값 자동 설정) | 운영: `https://pay.paygate.naver.com`, 개발: `https://dev-pay.paygate.naver.com` |

```json
{
    "driver": "naverpay",
    "client_key": "${NAVERPAY_CLIENT_ID}",
    "secret_key": "${NAVERPAY_CLIENT_SECRET}",
    "mid": "${NAVERPAY_CHAIN_ID}"
}
```

**인증 방식**: HTTP 헤더 3개

```
X-Naver-Client-Id: {client_id}
X-Naver-Client-Secret: {client_secret}
X-NaverPay-Chain-Id: {chain_id}
```

**주요 API 엔드포인트**:

| 동작      | 메서드 | 경로                                                                |
| --------- | ------ | ------------------------------------------------------------------- |
| 결제 승인 | POST   | `/naverpay-partner/naverpay/payments/v2.2/apply/payment`            |
| 결제 취소 | POST   | `/naverpay-partner/naverpay/payments/v1/cancel`                     |
| 결제 조회 | POST   | `/naverpay-partner/naverpay/payments/v2.2/list/history/{paymentId}` |

**결제 흐름** (단건결제 SDK 방식):

1. 프론트에서 `Naver.Pay.create({clientId, chainId})` SDK 초기화
2. `Naver.Pay.open({merchantPayKey, totalPayAmount, returnUrl, ...})` 결제창 호출
3. 네이버페이 → `returnUrl?resultCode=Success&paymentId={네이버페이결제번호}` 리다이렉트
4. 서버: `paymentId`로 결제 승인 API 호출 → 최종 결제 완료

**요청/응답 형식**:

- 승인/취소: `Content-Type: application/x-www-form-urlencoded`
- 조회: `Content-Type: application/json`

**성공 응답**: `code == "Success"`

> **중요**: 결제창 SDK에서 전달된 `paymentId`를 `ConfirmPayment` 요청의 `PaymentKey` 필드에 전달해야 합니다.

### 3-9. 페이코 설정

> ⚠️ **추정 구현**: PAYCO 결제 API는 가맹점 계약 후 공식 명세가 별도 제공됩니다. 이 구현은 `crossplatform.payco.com` 기반 추정 구현이며, 실제 연동 전 공식 명세 검증이 필요합니다.

**필드 매핑** (`PgProviderConfig`):

| 설정 필드    | 의미                          | 비고                                      |
| ------------ | ----------------------------- | ----------------------------------------- |
| `secret_key` | PAYCO seller key              | 가맹점센터에서 발급 (필수)                |
| `client_key` | PAYCO client ID (선택)        | X-Nncp-Client-Id 헤더 및 body clientId    |
| `api_url`    | API 도메인 (기본값 자동 설정) | 기본값: `https://crossplatform.payco.com` |

```json
{
    "driver": "payco",
    "secret_key": "${PAYCO_SELLER_KEY}",
    "client_key": "${PAYCO_CLIENT_ID}"
}
```

**인증 방식**: sellerKey를 요청 body에 포함

**주요 API 엔드포인트** (추정):

| 동작      | 메서드 | 경로                          |
| --------- | ------ | ----------------------------- |
| 결제 승인 | POST   | `/v1/payment/completeConfirm` |
| 결제 취소 | POST   | `/v1/payment/cancel`          |
| 결제 조회 | POST   | `/v1/payment/pay/info`        |

**성공 응답**: `header.isSuccessful == true`

### 3-10. 카카오페이 설정

공식 문서: [카카오페이 개발자센터](https://developers.kakaopay.com/docs/payment/online/single-payment)

**필드 매핑** (`PgProviderConfig`):

| 설정 필드    | 의미                          | 비고                                    |
| ------------ | ----------------------------- | --------------------------------------- |
| `secret_key` | Secret Key                    | Authorization 헤더 (`SECRET_KEY {key}`) |
| `mid`        | CID (가맹점 코드, 10자)       | 테스트: `TC0ONETIME`                    |
| `api_url`    | API 도메인 (기본값 자동 설정) | 기본값: `https://open-api.kakaopay.com` |

```json
{
    "driver": "kakaopay",
    "secret_key": "${KAKAOPAY_SECRET_KEY}",
    "mid": "${KAKAOPAY_CID}"
}
```

**인증 방식**: HTTP 헤더

```
Authorization: SECRET_KEY {secret_key}
```

> 테스트 환경: `mid = TC0ONETIME`, `secret_key` = 개발자센터에서 발급받은 Secret key(dev)

**주요 API 엔드포인트**:

| 동작      | 메서드 | 경로                         |
| --------- | ------ | ---------------------------- |
| 결제 준비 | POST   | `/online/v1/payment/ready`   |
| 결제 승인 | POST   | `/online/v1/payment/approve` |
| 결제 취소 | POST   | `/online/v1/payment/cancel`  |
| 주문 조회 | POST   | `/online/v1/payment/order`   |

**결제 흐름** (2단계 방식):

1. 서버: `POST /online/v1/payment/ready` 호출 → `tid` + 리다이렉트 URL 획득
2. 클라이언트: 카카오페이 결제창 오픈 → 사용자 인증 완료
3. 카카오페이 → `approval_url?pg_token={pg_token}` 리다이렉트
4. 서버: `ConfirmPayment` 호출 — `PaymentKey = "{tid}:{pg_token}"` 형식으로 전달

**성공 응답**: HTTP 200 OK

**에러 응답**: HTTP 4xx/5xx + `{"error_code": int, "error_message": string}`

> **중요**: `ConfirmPayment`의 `PaymentKey`는 `"{tid}:{pg_token}"` 형식이어야 합니다. 승인 성공 후 DB에는 `tid`가 저장됩니다. 이후 취소/조회 시에는 `tid`를 그대로 사용합니다.

### 3-11. 프로바이더 선택 가이드

**A그룹 — 전통 PG사**

| 기준            | Toss Payments               | KCP                         | 이니시스                    | 다날             | 헥토파이낸셜      |
| --------------- | --------------------------- | --------------------------- | --------------------------- | ---------------- | ----------------- |
| 개발 편의성     | ★★★ (REST, 최신 문서)       | ★★ (REST)                   | ★★ (REST)                   | ★★               | ★★                |
| 테스트 환경     | ★★★ (무료 테스트 키 즉시)   | ★★                          | ★★                          | ★★               | ★★                |
| 결제수단        | 카드, 가상계좌, 간편결제 등 | 카드, 가상계좌, 간편결제 등 | 카드, 가상계좌, 간편결제 등 | 카드, 휴대폰결제 | 카드, 가상계좌 등 |
| 인증 방식       | Basic Auth                  | Secret 헤더                 | SignKey 헤더                | Basic Auth       | AES+pktHash       |
| 웹훅            | ★★★ (secret 검증)           | IP 화이트리스트             | 패스스루                    | 패스스루         | 패스스루          |
| Idempotency-Key | ✅ 지원                     | ❌                          | ❌                          | ❌               | ❌                |

**B그룹 — 간편결제 / 기타**

| 기준            | 워너페이먼츠      | 네이버페이              | 페이코             | 카카오페이            |
| --------------- | ----------------- | ----------------------- | ------------------ | --------------------- |
| 개발 편의성     | ★★                | ★★ (SDK+REST)           | ★★ (추정)          | ★★★ (REST, 공식문서)  |
| 테스트 환경     | ★★                | ★★ (development 모드)   | ★ (계약 필요)      | ★★★ (TC0ONETIME 즉시) |
| 결제수단        | 카드, 간편결제 등 | 네이버페이(카드+포인트) | PAYCO(카드+포인트) | 카카오페이(카드+머니) |
| 인증 방식       | Bearer 토큰       | X-Naver-\* 헤더 3개     | sellerKey body     | SECRET_KEY 헤더       |
| 웹훅            | 패스스루          | IP 기반                 | IP 기반            | 패스스루              |
| Idempotency-Key | ❌                | ✅ (선택)               | ❌                 | ❌                    |

---

## 4) 결제 흐름 (단건결제)

### 4-1. 전체 시퀀스

```
┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│ Client App   │    │ Entity Server  │    │ PG (Toss)    │
└──────┬───────┘    └───────┬────────┘    └──────┬───────┘
       │                    │                     │
       │ 1. 주문 생성       │                     │
       │ POST /v1/pg/orders │                     │
       │ ──────────────────>│                     │
       │                    │ (a) 금액 검증       │
       │                    │ (b) pg_order 생성   │
       │   {orderId,        │     status=created  │
       │    clientKey, ...} │                     │
       │ <──────────────────│                     │
       │                    │                     │
       │ 2. SDK로 결제창    │                     │
       │ ──────────────────────────────────────> │
       │                    │                     │
       │ 3. 인증 완료       │                     │
       │   (리다이렉트)     │                     │
       │ <──────────────────────────────────────  │
       │  ?paymentKey=...   │                     │
       │  &orderId=...      │                     │
       │  &amount=...       │                     │
       │                    │                     │
       │ 4. 결제 승인       │                     │
       │ POST /v1/pg/confirm│                     │
       │ ──────────────────>│                     │
       │                    │ (c) 금액 재검증     │
       │                    │ (d) 상태 확인       │
       │                    │ POST /confirm       │
       │                    │ ───────────────────>│
       │                    │ Payment(DONE)       │
       │                    │ <───────────────────│
       │                    │ (e) pg_order 업데이트│
       │  {status:"done",   │     status=done     │
       │   paymentKey, ...} │                     │
       │ <──────────────────│                     │
       │                    │                     │
       │                    │ 5. 웹훅 (선택)      │
       │                    │ <───────────────────│
       │                    │ (f) 상태 재확인     │
```

### 4-2. 단계별 설명

| 단계 | 요청                            | 설명                                                 |
| ---- | ------------------------------- | ---------------------------------------------------- |
| 1    | `POST /v1/pg/orders`            | 서버에 주문 생성. **금액을 서버에 기록** (변조 방지) |
| 2-3  | PG SDK 결제창                   | 클라이언트에서 PG SDK로 결제수단 인증                |
| 4    | `POST /v1/pg/confirm`           | 서버에서 금액 재검증 후 PG사 승인 API 호출           |
| 5    | `POST /v1/pg/webhook` (PG→서버) | PG사에서 상태 변경 시 서버로 통知 (가상계좌 등)      |

### 4-3. 결제 상태 흐름

```
created ───> ready ───> in_progress ───> done ───> canceled
   │                        │              │           ↑
   │                        │              │    partial_canceled
   │                        ↓              │
   │                     aborted           │
   │                                       │
   └──────────────────> expired            │
                          (30분 미승인)     │
                                           │
                 waiting ──────────────────┘
                (가상계좌 입금 대기)
```

| 상태               | 설명                          | 전이 가능 →                       |
| ------------------ | ----------------------------- | --------------------------------- |
| `created`          | 주문 생성됨, 결제 전          | `ready`, `in_progress`, `expired` |
| `ready`            | 결제창 준비 완료              | `in_progress`, `expired`          |
| `in_progress`      | 결제수단 인증 완료, 승인 대기 | `done`, `aborted`, `expired`      |
| `waiting`          | 가상계좌 입금 대기            | `done`, `canceled`, `expired`     |
| `done`             | ✅ 결제 승인 완료             | `canceled`, `partial_canceled`    |
| `canceled`         | 전액 취소 완료                | —                                 |
| `partial_canceled` | 부분 취소 완료                | `canceled`                        |
| `aborted`          | 승인 실패                     | —                                 |
| `expired`          | 유효 시간 초과 (30분)         | —                                 |

---

## 5) API 레퍼런스

### 5-1. 주문 생성

```
POST /v1/pg/orders
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**요청:**

| 필드             | 타입   | 필수 | 설명                                |
| ---------------- | ------ | ---- | ----------------------------------- |
| `amount`         | int64  | ✅   | 결제 금액 (원)                      |
| `order_name`     | string | ✅   | 주문명 (최대 100자)                 |
| `currency`       | string | —    | 통화 코드 (기본: `KRW`)             |
| `customer_name`  | string | —    | 구매자 이름                         |
| `customer_email` | string | —    | 구매자 이메일                       |
| `provider`       | string | —    | 프로바이더 (기본: `default` 설정값) |
| `metadata`       | object | —    | 커스텀 메타데이터                   |

**응답 (201):**

```json
{
    "ok": true,
    "data": {
        "order_id": "ORD_1709123456789_aB3x",
        "amount": 50000,
        "order_name": "토스 티셔츠 외 2건",
        "status": "created",
        "client_key": "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
        "success_url": "/payment/success",
        "fail_url": "/payment/fail"
    }
}
```

> `client_key`는 클라이언트에서 PG SDK를 초기화할 때 사용합니다.

### 5-2. 주문 조회

```
GET /v1/pg/orders/:orderId
Authorization: Bearer <JWT_TOKEN>
```

**응답 (200):**

```json
{
    "ok": true,
    "data": {
        "order_id": "ORD_1709123456789_aB3x",
        "status": "done",
        "amount": 50000,
        "balance_amount": 50000,
        "payment_key": "5EnNZRJG...",
        "provider": "toss_payments",
        "method": "카드",
        "customer_name": "김토스",
        "approved_time": "2026-03-01T12:18:14+09:00",
        "card_info": {
            "number": "12345678****000*",
            "card_type": "신용",
            "approve_no": "00000000"
        },
        "receipt_url": "https://dashboard.tosspayments.com/receipt/..."
    }
}
```

### 5-3. 결제 승인

```
POST /v1/pg/confirm
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**요청:**

| 필드          | 타입   | 필수 | 설명                         |
| ------------- | ------ | ---- | ---------------------------- |
| `payment_key` | string | ✅   | PG SDK 인증 후 받은 결제 키  |
| `order_id`    | string | ✅   | 주문 생성 시 발급된 주문번호 |
| `amount`      | int64  | ✅   | 결제 금액 (서버 검증용)      |

**서버 내부 처리:**

1. `order_id`로 `pg_order` 조회
2. 요청 `amount`와 저장된 금액 비교 → **불일치 시 거부** (금액 변조 방지)
3. `status`가 `created` 또는 `in_progress`인지 확인
4. PG사 승인 API 호출
5. 성공 시: `pg_order` 업데이트 (`status=done`, `payment_key`, `card_info` 등)
6. 실패 시: `pg_order` 업데이트 (`status=aborted`, `failure` 정보)

**응답 (200):**

```json
{
    "ok": true,
    "data": {
        "status": "done",
        "payment_key": "5EnNZRJG...",
        "order_id": "ORD_1709123456789_aB3x",
        "total_amount": 50000,
        "balance_amount": 50000,
        "method": "카드",
        "approved_time": "2026-03-01T12:18:14+09:00",
        "card": {
            "number": "12345678****000*",
            "card_type": "신용",
            "approve_no": "00000000"
        },
        "receipt_url": "https://dashboard.tosspayments.com/receipt/..."
    }
}
```

### 5-4. 클라이언트 설정 조회

```
GET /v1/pg/config?provider=toss_payments
```

**응답 (200):**

```json
{
    "ok": true,
    "data": {
        "client_key": "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
        "success_url": "/payment/success",
        "fail_url": "/payment/fail"
    }
}
```

> `secret_key`는 **절대 반환하지 않습니다**.

### 5-5. 상태 동기화

PG사에서 결제 정보를 재조회하여 로컬 상태를 동기화합니다. 웹훅 누락 시 수동 복구 용도입니다.

```
POST /v1/pg/orders/:orderId/sync
Authorization: Bearer <JWT_TOKEN>
```

---

## 6) 결제 취소 / 환불

### 6-1. 전액 취소

```bash
curl -X POST http://localhost:3000/v1/pg/orders/ORD_1709123456789_aB3x/cancel \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_reason": "구매자 변심"
  }'
```

응답:

```json
{
    "ok": true,
    "data": {
        "status": "canceled",
        "total_amount": 50000,
        "balance_amount": 0,
        "cancel_amount": 50000
    }
}
```

### 6-2. 부분 취소

`cancel_amount`를 지정하면 부분 취소됩니다:

```bash
curl -X POST http://localhost:3000/v1/pg/orders/ORD_1709123456789_aB3x/cancel \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_reason": "일부 상품 반품",
    "cancel_amount": 15000
  }'
```

응답:

```json
{
    "ok": true,
    "data": {
        "status": "partial_canceled",
        "total_amount": 50000,
        "balance_amount": 35000,
        "cancel_amount": 15000,
        "refundable_amount": 35000
    }
}
```

### 6-3. 가상계좌 환불

가상계좌로 결제된 건을 취소할 때는 환불 계좌 정보가 필수입니다:

```json
{
    "cancel_reason": "구매자 변심",
    "refund_account": {
        "bank": "20",
        "account_number": "3140100000001",
        "holder_name": "홍길동"
    }
}
```

### 6-4. 취소 API 요청 필드

| 필드             | 타입   | 필수 | 설명                                 |
| ---------------- | ------ | ---- | ------------------------------------ |
| `cancel_reason`  | string | ✅   | 취소 사유                            |
| `cancel_amount`  | int64  | —    | 부분 취소 금액 (미지정 시 전액 취소) |
| `refund_account` | object | —    | 환불 계좌 (가상계좌 결제 시 필수)    |

### 6-5. 취소 가능 조건

| 현재 상태          | 취소 가능 | 결과 상태                          |
| ------------------ | --------- | ---------------------------------- |
| `done`             | ✅        | `canceled` 또는 `partial_canceled` |
| `partial_canceled` | ✅        | `partial_canceled` 또는 `canceled` |
| `created`          | ❌        | —                                  |
| `waiting`          | ✅        | `canceled`                         |
| 그 외              | ❌        | —                                  |

---

## 7) 웹훅 수신

### 7-1. 개요

PG사는 결제 상태가 변경되면 서버로 웹훅을 발송합니다. 주로 **가상계좌 입금 확인**, **결제 상태 변경** 이벤트에 사용됩니다.

### 7-2. 엔드포인트

```
POST /v1/pg/webhook
```

이 엔드포인트는 **JWT 인증 없이** 접근 가능합니다 (PG사에서 호출하므로).

### 7-3. PG사 대시보드 설정

PG사 대시보드에서 웹훅 URL을 등록합니다:

```
https://your-domain.com/v1/pg/webhook
```

### 7-4. 처리 흐름

```
PG사 웹훅 수신
  │
  ├─ 1. JSON 파싱 (paymentKey, orderID, eventType 추출)
  ├─ 2. 멱등성 확인 (pg_webhook_log에 동일 이벤트 있으면 스킵)
  ├─ 3. pg_webhook_log INSERT (status=received)
  ├─ 4. PG사에서 결제 정보 재조회 (상태 신뢰성 확보)
  ├─ 5. pg_order 상태 업데이트 (재조회 결과 기반)
  └─ 6. pg_webhook_log UPDATE (status=processed 또는 failed)
```

> **중요:** 웹훅 처리 성공/실패와 관계없이 **반드시 200 OK를 반환**합니다. 그렇지 않으면 PG사에서 반복 재전송합니다.

### 7-5. 웹훅 이벤트 타입

| 이벤트                   | 설명                           |
| ------------------------ | ------------------------------ |
| `PAYMENT_STATUS_CHANGED` | 결제 상태 변경 (승인, 취소 등) |
| `DEPOSIT_CALLBACK`       | 가상계좌 입금 완료             |

### 7-6. 웹훅 검증

| 프로바이더    | 검증 방식                                        |
| ------------- | ------------------------------------------------ |
| Toss Payments | `X-Webhook-Signature` 값과 `webhook_secret` 비교 |
| KCP           | IP 화이트리스트 기반                             |
| 이니시스      | 패스스루 (서버 측 재조회로 검증)                 |

---

## 8) 시스템 엔티티

### 8-1. pg_order (주문/결제)

> `entities/System/Payment/pg_order.json`

| 구분   | 필드                   | 타입    | 설명                     |
| ------ | ---------------------- | ------- | ------------------------ |
| index  | `order_id`             | string  | 고유 주문번호 (unique)   |
| index  | `status`               | enum    | 결제 상태 (9가지)        |
| index  | `payment_key`          | string  | PG사 결제 키             |
| index  | `provider`             | string  | PG 프로바이더            |
| index  | `method`               | string  | 결제수단                 |
| index  | `amount`               | integer | 총 결제 금액             |
| index  | `balance_amount`       | integer | 취소 가능 잔액           |
| index  | `currency`             | string  | 통화 코드 (기본: KRW)    |
| index  | `account_seq`          | integer | 구매자 계정 seq          |
| index  | `customer_name`        | string  | 구매자 이름              |
| index  | `customer_email`       | string  | 구매자 이메일            |
| fields | `order_name`           | string  | 주문명                   |
| fields | `requested_time`       | string  | 결제 요청 시각           |
| fields | `approved_time`        | string  | 결제 승인 시각           |
| fields | `card_info`            | string  | 카드 결제 상세 (JSON)    |
| fields | `virtual_account_info` | string  | 가상계좌 정보 (JSON)     |
| fields | `easy_pay_info`        | string  | 간편결제 정보 (JSON)     |
| fields | `receipt_url`          | string  | 영수증 URL               |
| fields | `checkout_url`         | string  | 결제창 URL               |
| fields | `failure_code`         | string  | 실패 코드                |
| fields | `failure_message`      | string  | 실패 메시지              |
| fields | `metadata`             | string  | 커스텀 메타데이터 (JSON) |
| fields | `pg_raw_response`      | string  | PG 원본 응답 (JSON)      |

- `history: true` — 상태 변경 이력 자동 기록
- CAS (Compare-And-Swap)로 동시성 안전한 상태 전이 보장

### 8-2. pg_cancel (취소/환불)

> `entities/System/Payment/pg_cancel.json`

| 구분   | 필드                | 타입    | 설명              |
| ------ | ------------------- | ------- | ----------------- |
| index  | `order_seq`         | integer | pg_order 참조 seq |
| index  | `order_id`          | string  | 주문번호          |
| index  | `cancel_amount`     | integer | 취소 금액         |
| index  | `cancel_reason`     | string  | 취소 사유         |
| index  | `cancel_status`     | enum    | done / failed     |
| index  | `transaction_key`   | string  | PG사 취소 거래 키 |
| fields | `canceled_time`     | string  | 취소 시각         |
| fields | `refundable_amount` | integer | 환불 가능 잔액    |
| fields | `tax_free_amount`   | integer | 면세 금액         |
| fields | `receipt_key`       | string  | 영수증 키         |
| fields | `refund_account`    | string  | 환불 계좌 (JSON)  |

- `read_only: true` — 취소 기록은 수정/삭제 불가

### 8-3. pg_webhook_log (웹훅 로그)

> `entities/System/Payment/pg_webhook_log.json`

| 구분   | 필드             | 타입   | 설명                          |
| ------ | ---------------- | ------ | ----------------------------- |
| index  | `event_type`     | string | 이벤트 타입                   |
| index  | `order_id`       | string | 관련 주문번호                 |
| index  | `payment_key`    | string | 관련 결제 키                  |
| index  | `status`         | enum   | received / processed / failed |
| index  | `provider`       | string | PG 프로바이더                 |
| fields | `payload`        | string | 원본 웹훅 페이로드 (JSON)     |
| fields | `processed_time` | string | 처리 완료 시각                |
| fields | `error_message`  | string | 에러 메시지                   |
| fields | `signature`      | string | 웹훅 서명 값                  |

- `hard_delete: true`, `read_only: true`
- 멱등성 보장: 동일 `payment_key` + `event_type` 조합의 중복 처리 방지

---

## 9) Hook 연동

결제 완료 또는 취소 시 엔티티 후크를 트리거할 수 있습니다.

### 9-1. 결제 완료 후 알림 발송 예시

`pg_order` 엔티티에 후크를 설정하면, 결제 상태가 `done`으로 변경될 때 자동으로 알림을 발송할 수 있습니다:

```json
{
    "hooks": {
        "after_update": [
            {
                "type": "alimtalk",
                "enabled": true,
                "condition": "${new.status} == 'done' && ${old.status} != 'done'",
                "alimtalk_receiver": "${new.customer_phone}",
                "alimtalk_template_code": "PAYMENT_001",
                "alimtalk_variables": {
                    "name": "${new.customer_name}",
                    "amount": "${new.amount}",
                    "method": "${new.method}"
                }
            },
            {
                "type": "webhook",
                "enabled": true,
                "condition": "${new.status} == 'done'",
                "webhook_url": "https://external-system.com/payment-callback",
                "async": true
            }
        ]
    }
}
```

### 9-2. Hook에서 사용 가능한 PG 컨텍스트

| 변수                    | 설명          |
| ----------------------- | ------------- |
| `${new.order_id}`       | 주문번호      |
| `${new.status}`         | 현재 상태     |
| `${new.amount}`         | 결제 금액     |
| `${new.method}`         | 결제수단      |
| `${new.payment_key}`    | PG 결제 키    |
| `${new.customer_name}`  | 구매자 이름   |
| `${new.customer_email}` | 구매자 이메일 |
| `${new.approved_time}`  | 승인 시각     |

---

## 10) 클라이언트 연동 예시

### 10-1. JavaScript (Toss Payments SDK)

```html
<!-- 1. Toss Payments SDK 로드 -->
<script src="https://js.tosspayments.com/v2/standard"></script>

<script>
    // 2. 서버에서 client_key 조회
    const configRes = await fetch('/v1/pg/config');
    const { data: config } = await configRes.json();

    // 3. SDK 초기화
    const tossPayments = TossPayments(config.client_key);
    const payment = tossPayments.payment({ customerKey: 'CUSTOMER_KEY' });

    // 4. 서버에 주문 생성 요청
    async function requestPayment() {
        const orderRes = await fetch('/v1/pg/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: 50000,
                order_name: '토스 티셔츠 외 2건',
                customer_name: '김토스',
                customer_email: 'customer@email.com'
            })
        });
        const { data: order } = await orderRes.json();

        // 5. 결제창 띄우기
        await payment.requestPayment({
            method: '카드',
            amount: { currency: 'KRW', value: order.amount },
            orderId: order.order_id,
            orderName: order.order_name,
            successUrl: `${window.location.origin}${order.success_url}`,
            failUrl: `${window.location.origin}${order.fail_url}`
        });
    }
</script>
```

### 10-2. 결제 승인 처리 (success 페이지)

```javascript
// success 페이지에서 쿼리 파라미터 추출
const urlParams = new URLSearchParams(window.location.search);
const paymentKey = urlParams.get("paymentKey");
const orderId = urlParams.get("orderId");
const amount = urlParams.get("amount");

// 서버에 결제 승인 요청
const confirmRes = await fetch("/v1/pg/confirm", {
    method: "POST",
    headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        payment_key: paymentKey,
        order_id: orderId,
        amount: Number(amount),
    }),
});

const result = await confirmRes.json();
if (result.ok) {
    // 결제 성공 처리
    console.log("결제 완료:", result.data);
} else {
    // 결제 실패 처리
    console.error("결제 실패:", result.message);
}
```

### 10-3. React 예시

```tsx
import { useEffect, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

function PaymentPage() {
    const [payment, setPayment] = useState(null);

    useEffect(() => {
        async function init() {
            // 서버에서 client_key 조회
            const res = await fetch("/v1/pg/config");
            const { data } = await res.json();

            const tossPayments = await loadTossPayments(data.client_key);
            setPayment(tossPayments.payment({ customerKey: "CUSTOMER_KEY" }));
        }
        init();
    }, []);

    const handlePayment = async () => {
        // 1. 서버에 주문 생성
        const orderRes = await fetch("/v1/pg/orders", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: 50000,
                order_name: "토스 티셔츠 외 2건",
            }),
        });
        const { data: order } = await orderRes.json();

        // 2. 결제창 띄우기
        await payment.requestPayment({
            method: "카드",
            amount: { currency: "KRW", value: order.amount },
            orderId: order.order_id,
            orderName: order.order_name,
            successUrl: `${window.location.origin}/payment/success`,
            failUrl: `${window.location.origin}/payment/fail`,
        });
    };

    return <button onClick={handlePayment}>결제하기</button>;
}
```

### 10-4. Flutter 예시

```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class PaymentService {
  final String baseUrl;
  final String token;

  PaymentService({required this.baseUrl, required this.token});

  /// 주문 생성
  Future<Map<String, dynamic>> createOrder({
    required int amount,
    required String orderName,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/pg/orders'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'amount': amount,
        'order_name': orderName,
      }),
    );
    return jsonDecode(res.body)['data'];
  }

  /// 결제 승인
  Future<Map<String, dynamic>> confirmPayment({
    required String paymentKey,
    required String orderId,
    required int amount,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/pg/confirm'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'payment_key': paymentKey,
        'order_id': orderId,
        'amount': amount,
      }),
    );
    return jsonDecode(res.body);
  }
}
```

---

## 11) 보안 권장사항

### 11-1. PCI-DSS 준수

Entity Server는 카드 정보를 **절대 저장하지 않습니다**:

| 원칙                | 구현 방식                                |
| ------------------- | ---------------------------------------- |
| 카드 정보 미저장    | PG사 토큰 기반, `payment_key`만 저장     |
| 카드번호 마스킹     | `12345678****000*` 형태로만 표시         |
| 시크릿 키 보안      | 환경변수 `${TOSS_SECRET_KEY}`로 관리     |
| HTTPS 전용          | PG API 호출 및 웹훅 수신 시 TLS 필수     |
| CVV/비밀번호 미전송 | 서버에서 처리 안 함 (PG SDK 결제창 영역) |

### 11-2. 금액 변조 방지

서버에서 **이중 검증**을 수행합니다:

```
1. 주문 생성 시: 서버에 amount 저장
2. 결제 승인 시: 클라이언트가 보낸 amount와 서버 저장 금액 비교
   → 불일치 시 승인 거부 (400 Bad Request)
```

### 11-3. 시크릿 키 관리

```bash
# ✅ 올바른 방법: 환경변수로 관리
TOSS_SECRET_KEY=test_gsk_docs_OaPz8L5KdmQXkzJ59P0vlemYq7gg

# ❌ 잘못된 방법: pg.json에 직접 하드코딩
# "secret_key": "test_gsk_docs_OaPz8L5KdmQXkzJ59P0vlemYq7gg"  ← 하지 마세요
```

### 11-4. 웹훅 보안

- PG사 대시보드에서 **웹훅 시크릿**을 설정하고, `pg.json`의 `webhook_secret`과 동일하게 맞춥니다.
- 서버는 `X-Webhook-Signature` 헤더와 저장된 시크릿을 비교하여 위조된 웹훅을 차단합니다.
- 웹훅 처리와 별도로 **PG사에서 결제 정보를 재조회**하여 상태를 검증합니다 (신뢰하지 않고 확인).

### 11-5. 접근 제어

| API               | 접근 권한                             |
| ----------------- | ------------------------------------- |
| `POST /orders`    | 인증된 사용자 (JWT)                   |
| `GET /orders/:id` | 인증된 사용자 (본인 주문)             |
| `POST /confirm`   | 인증된 사용자 (본인 주문)             |
| `POST /cancel`    | 인증된 사용자 (본인 주문) 또는 관리자 |
| `POST /webhook`   | 서명 검증 (JWT 불필요)                |
| `POST /sync`      | 관리자 전용                           |
| `GET /config`     | 공개 (client_key만 반환)              |

---

## 12) 상태 코드 및 에러 처리

### 12-1. HTTP 상태 코드

| 코드 | 의미                                      | 예시                         |
| ---- | ----------------------------------------- | ---------------------------- |
| 200  | 성공                                      | 승인 완료, 조회 성공         |
| 201  | 생성 성공                                 | 주문 생성                    |
| 400  | 잘못된 요청 (금액 불일치, 필수 필드 누락) | 금액 변조, 파라미터 오류     |
| 404  | 주문 없음                                 | 잘못된 orderId               |
| 409  | 상태 충돌 (이미 처리됨)                   | 이미 승인된 주문 재승인 시도 |
| 500  | 서버 내부 오류                            | DB 오류                      |
| 502  | PG사 오류                                 | PG API 호출 실패             |

### 12-2. 에러 응답 형식

```json
{
    "ok": false,
    "message": "amount mismatch: expected 50000, got 49000"
}
```

### 12-3. PG사 에러 코드 예시 (Toss)

| 코드                   | 설명             | 대응                      |
| ---------------------- | ---------------- | ------------------------- |
| `ALREADY_PROCESSED`    | 이미 처리된 결제 | 중복 요청, 무시 가능      |
| `INVALID_CARD_COMPANY` | 잘못된 카드사    | 사용자에게 다른 카드 안내 |
| `EXCEED_MAX_AMOUNT`    | 금액 초과        | 금액 제한 확인            |
| `NOT_FOUND_PAYMENT`    | 결제 정보 없음   | paymentKey 확인           |
| `INVALID_STOPPED_CARD` | 정지된 카드      | 사용자에게 안내           |

---

## 13) 운영 참고사항

### 13-1. 테스트 vs 라이브

| 구분   | 클라이언트 키 접두어 | 시크릿 키 접두어 | 실제 결제 |
| ------ | -------------------- | ---------------- | --------- |
| 테스트 | `test_gck_*`         | `test_gsk_*`     | ❌        |
| 라이브 | `live_gck_*`         | `live_gsk_*`     | ✅        |

> 개발/스테이징 환경에서는 반드시 **테스트 키**를 사용하세요.

### 13-2. 멀티 프로바이더

`providers` 배열에 여러 프로바이더를 등록할 수 있습니다. 주문 생성 시 `provider` 필드로 특정 프로바이더를 지정하거나, 미지정 시 `default`로 설정된 프로바이더가 사용됩니다.

```json
{
    "default": "toss_payments",
    "providers": [
        { "driver": "toss_payments", ... },
        { "driver": "kcp", ... }
    ]
}
```

```bash
# 특정 프로바이더 지정
curl -X POST /v1/pg/orders \
  -d '{"amount": 50000, "order_name": "...", "provider": "kcp"}'
```

### 13-3. 주문 ID 구조

주문 ID는 `{prefix}_{timestamp}_{random}` 형태로 자동 생성됩니다:

```
ORD_1709123456789_aB3x
 │         │        │
 │         │        └── 4자리 랜덤 hex
 │         └── Unix 타임스탬프 (밀리초)
 └── order_id_prefix (설정 가능)
```

### 13-4. 웹훅 URL 등록

PG사 대시보드에서 다음 형태로 웹훅 URL을 등록합니다:

```
https://your-domain.com/v1/pg/webhook
```

- 반드시 **HTTPS**여야 합니다.
- 방화벽에서 PG사 IP를 허용해야 합니다.
- 웹훅 처리가 5초 이내에 200 OK를 반환하도록 설계되어 있습니다.

### 13-5. 상태 동기화

웹훅이 누락되거나 상태가 불일치할 경우, 관리자가 수동으로 상태를 동기화할 수 있습니다:

```bash
curl -X POST http://localhost:3000/v1/pg/orders/ORD_1709123456789_aB3x/sync \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

이 요청은 PG사에서 결제 정보를 직접 재조회하여 `pg_order` 상태를 갱신합니다.

### 13-6. 로그 확인

PG 관련 로그는 `[WARN] pg:` 접두어로 기록됩니다:

```
[WARN] pg: create order failed: amount below minimum (50 < 100)
[WARN] pg: confirm payment failed: amount mismatch
[WARN] pg: webhook processing failed: invalid signature
```

### 13-7. setup.go 초기화 순서

PG 서비스는 서버 시작 시 다음 순서로 초기화됩니다:

```
setupSmtpService()      // 1. 이메일
setupPushService()      // 2. 푸시
setupSmsService()       // 3. SMS
setupAlimtalkService()  // 4. 알림톡
setupPgService()        // 5. PG 결제
```

### 13-8. 향후 로드맵

| Phase | 범위                                            | 상태    |
| ----- | ----------------------------------------------- | ------- |
| 1     | **단건결제** (주문 생성, 승인, 취소, 웹훅)      | ✅ 구현 |
| 2     | 환불 계좌 관리, 정산 조회, 현금영수증, 에스크로 | 🔜 계획 |
| 3     | 빌링키/정기결제, 구독 스케줄러, 해외 결제       | 🔜 계획 |
