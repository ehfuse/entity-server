# 편의 기능 라우트 (Utils Routes)

> `/v1/utils/*` — QR 코드·바코드 생성 등 범용 편의 API

---

## 목차

- [QR 코드 생성 (PNG)](#qr-png)
- [QR 코드 생성 (Base64)](#qr-base64)
- [QR 코드 생성 (ASCII 아트)](#qr-text)
- [바코드 생성 (PNG)](#barcode-png)
- [QR 코드 공통 파라미터](#qr-common-params)
- [바코드 공통 파라미터](#barcode-common-params)
- [에러 응답](#error-response)

---

<a id="qr-png"></a>

## QR 코드 생성 (PNG)

QR 코드를 PNG 이미지 바이너리로 반환합니다.

### POST /v1/utils/qrcode

```json
{
    "content": "https://example.com",
    "size": 256,
    "error_correction": "medium",
    "fg_color": "#000000",
    "bg_color": "#ffffff"
}
```

### GET /v1/utils/qrcode

쿼리 파라미터로도 호출할 수 있습니다:

```
GET /v1/utils/qrcode?content=https://example.com&size=256&error_correction=medium&fg_color=%23003366&bg_color=%23fffff0
```

### 응답

- **Content-Type**: `image/png`
- **Body**: PNG 바이너리 데이터

> `<img src="/v1/utils/qrcode?content=hello">` 형태로 HTML에서 직접 사용 가능합니다.

---

<a id="qr-base64"></a>

## QR 코드 생성 (Base64)

QR 코드를 base64 인코딩 문자열과 data URI로 반환합니다.

### POST /v1/utils/qrcode/base64

```json
{
    "content": "otpauth://totp/MyService:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyService",
    "size": 300,
    "error_correction": "high",
    "fg_color": "#1a1a2e"
}
```

### GET /v1/utils/qrcode/base64

```
GET /v1/utils/qrcode/base64?content=hello&size=300
```

### 응답

```json
{
    "ok": true,
    "data": {
        "base64": "iVBORw0KGgo...",
        "data_uri": "data:image/png;base64,iVBORw0KGgo..."
    }
}
```

> `data_uri`는 `<img src="...">` 태그에 직접 삽입할 수 있는 형식입니다.

---

<a id="qr-text"></a>

## QR 코드 생성 (ASCII 아트)

QR 코드를 터미널에서 표시 가능한 ASCII 문자열로 반환합니다. 디버깅, 서버측 복붙 시나리오에 유용합니다.

### POST /v1/utils/qrcode/text

```json
{
    "content": "https://example.com",
    "error_correction": "medium"
}
```

### GET /v1/utils/qrcode/text

```
GET /v1/utils/qrcode/text?content=https://example.com
```

### 응답

- **Content-Type**: `text/plain; charset=utf-8`
- **Body**: 화이트스페이스/기호 문자로 구성된 QR 코드

> `size` 파라미터는 ASCII 출력에 적용되지 않습니다.

---

<a id="barcode-png"></a>

## 바코드 생성 (PNG)

선형(1D) 및 2D 바코드를 PNG 이미지 바이너리로 반환합니다.

### POST /v1/utils/barcode

```json
{
    "content": "12345678901",
    "type": "code128",
    "width": 300,
    "height": 100
}
```

### GET /v1/utils/barcode

```
GET /v1/utils/barcode?content=12345678901&type=code128&width=300&height=100
```

### 응답

- **Content-Type**: `image/png`
- **Body**: PNG 바이너리 데이터

### 지원 타입

| `type`       | 이름                     | 허용 내용                              | 비고                        |
| ------------ | ------------------------ | -------------------------------------- | --------------------------- |
| `code128`    | Code 128                 | ASCII 128자 전체                       | **기본값**, 범용 1D 바코드  |
| `code39`     | Code 39                  | 대문자·숫자·일부 특수문자 (`-.$/+% `) | 산업/물류용                 |
| `ean13`      | EAN-13                   | 숫자 **12 또는 13**자리                | 국제 상품 코드 (체크섬 자동) |
| `ean8`       | EAN-8                    | 숫자 **7 또는 8**자리                  | 소형 상품용                 |
| `codabar`    | Codabar                  | 숫자·`-$:/.+`                          | 의료·도서관용               |
| `datamatrix` | Data Matrix              | ASCII 텍스트                           | 2D 바코드 (항상 정사각형)   |
| `itf`        | ITF (Interleaved 2 of 5) | 숫자 **짝수 자리** 필수                | 물류 외부 포장용            |

---

<a id="qr-common-params"></a>

## QR 코드 공통 파라미터

| 파라미터           | 타입   | 기본값      | 설명                                                                      |
| ------------------ | ------ | ----------- | ------------------------------------------------------------------------- |
| `content`          | string | **(필수)**  | QR에 인코딩할 텍스트 (최대 4,296바이트)                                   |
| `size`             | int    | `256`       | PNG 이미지 크기 (픽셀, 1~2048) — `/qrcode/text`에는 무시됨                |
| `error_correction` | string | `"medium"`  | 오류 복구 수준: `low` (7%), `medium` (15%), `high` (25%), `highest` (30%) |
| `fg_color`         | string | `"#000000"` | QR 전경색 hex 코드 (코드 모듈 색상) — PNG/Base64 전용                     |
| `bg_color`         | string | `"#ffffff"` | QR 배경색 hex 코드 — PNG/Base64 전용                                      |

> `fg_color` / `bg_color`는 `#RRGGBB` 또는 `RRGGBB` 형식을 모두 지원합니다. 3자리 단축 `#RGB`도 동작합니다.

### 오류 복구 수준 가이드

| 수준      | 복구율 | 권장 용도                                      |
| --------- | ------ | ---------------------------------------------- |
| `low`     | ~7%    | 화면 표시 전용, 파일 크기 최소화               |
| `medium`  | ~15%   | 일반 용도 (기본값)                             |
| `high`    | ~25%   | 인쇄물, 로고 삽입 시                           |
| `highest` | ~30%   | 열악한 환경 (작은 크기 인쇄, 손상 가능성 높음) |

---

<a id="barcode-common-params"></a>

## 바코드 공통 파라미터

| 파라미터  | 타입   | 기본값     | 설명                                                                          |
| --------- | ------ | ---------- | ----------------------------------------------------------------------------- |
| `content` | string | **(필수)** | 바코드에 인코딩할 데이터                                                       |
| `type`    | string | `code128`  | 바코드 타입 (위 지원 타입 목록 참조)                                           |
| `width`   | int    | `300`      | 출력 너비 (픽셀, 1~2048)                                                      |
| `height`  | int    | `100`      | 출력 높이 (픽셀, 1~2048; `datamatrix`는 정사각형으로 자동 조정)               |

---

<a id="error-response"></a>

## 에러 응답

| 상태 코드 | 조건                              | 응답 예시                                                                        |
| --------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `400`     | `content` 누락                    | `{"ok": false, "message": "content is required"}`                                |
| `400`     | `content` 길이 초과 (QR, 4,296B)  | `{"ok": false, "message": "content exceeds maximum length (4296 bytes)"}`        |
| `400`     | EAN13에 12·13자리 이외            | `{"ok": false, "message": "barcode: ean13 requires 12 or 13 digits, got N"}`     |
| `400`     | EAN8에 7·8자리 이외               | `{"ok": false, "message": "barcode: ean8 requires 7 or 8 digits, got N"}`        |
| `400`     | ITF에 홀수 자리 입력              | `{"ok": false, "message": "barcode: itf requires even number of digits, got N"}` |
| `400`     | 지원하지 않는 바코드 타입         | `{"ok": false, "message": "barcode: unsupported type \"xyz\" ..."}`              |
| `500`     | QR 코드 생성 실패                 | `{"ok": false, "message": "Failed to generate QR code"}`                         |

---

## 사용 예시

### cURL — QR PNG 저장

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "size": 512}' \
  --output qrcode.png
```

### cURL — QR 색상 지정

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "size": 512, "fg_color": "#003366", "bg_color": "#fffff0"}' \
  --output qrcode-color.png
```

### cURL — QR Base64 JSON

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode/base64 \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com"}'
```

### cURL — QR ASCII 아트 (터미널 표시)

```bash
curl "http://localhost:47200/v1/utils/qrcode/text?content=https://example.com"
```

### HTML 직접 삽입 (GET)

```html
<img
    src="http://localhost:47200/v1/utils/qrcode?content=https://example.com&size=200"
    alt="QR Code"
/>
```

### TOTP 2FA QR 코드

```bash
curl -X POST http://localhost:47200/v1/utils/qrcode/base64 \
  -H "Content-Type: application/json" \
  -d '{
    "content": "otpauth://totp/EntityServer:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=EntityServer",
    "size": 300,
    "error_correction": "high"
  }'
```

### cURL — Code128 바코드 저장

```bash
curl "http://localhost:47200/v1/utils/barcode?content=HELLO-WORLD-123&type=code128&width=400&height=120" \
  --output barcode.png
```

### cURL — EAN-13 바코드 (POST)

```bash
curl -X POST http://localhost:47200/v1/utils/barcode \
  -H "Content-Type: application/json" \
  -d '{"content": "590123412345", "type": "ean13", "width": 300, "height": 150}' \
  --output ean13.png
```

### cURL — Data Matrix (2D)

```bash
curl -X POST http://localhost:47200/v1/utils/barcode \
  -H "Content-Type: application/json" \
  -d '{"content": "https://example.com", "type": "datamatrix", "width": 200, "height": 200}' \
  --output datamatrix.png
```

### cURL — ITF (짝수 자리 숫자 필수)

```bash
curl "http://localhost:47200/v1/utils/barcode?content=12345678&type=itf" \
  --output itf.png
```

---

## 관련 문서

- [API 라우트 개요](api-routes.md)
- [2FA 인증 설계](../dev/design/2fa-design.md) — TOTP QR 코드 생성 활용
