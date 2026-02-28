# Timezone List (IANA 타임존 목록)

Entity Server의 `server.json.timezone`에서 사용할 수 있는 IANA 타임존 예시 목록입니다.

> 전체 공식 목록은 IANA tz database를 따릅니다.
>
> - https://www.iana.org/time-zones
> - https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

## 권장값

- `UTC`
- `Asia/Seoul`

## Asia

- `Asia/Seoul`
- `Asia/Tokyo`
- `Asia/Shanghai`
- `Asia/Hong_Kong`
- `Asia/Taipei`
- `Asia/Singapore`
- `Asia/Bangkok`
- `Asia/Jakarta`
- `Asia/Manila`
- `Asia/Kolkata`
- `Asia/Dubai`

## Europe

- `Europe/London`
- `Europe/Paris`
- `Europe/Berlin`
- `Europe/Madrid`
- `Europe/Rome`
- `Europe/Amsterdam`
- `Europe/Prague`
- `Europe/Warsaw`
- `Europe/Athens`
- `Europe/Istanbul`

## Americas

- `America/New_York`
- `America/Chicago`
- `America/Denver`
- `America/Los_Angeles`
- `America/Toronto`
- `America/Vancouver`
- `America/Mexico_City`
- `America/Sao_Paulo`
- `America/Bogota`
- `America/Santiago`

## Oceania

- `Australia/Sydney`
- `Australia/Melbourne`
- `Australia/Brisbane`
- `Australia/Perth`
- `Pacific/Auckland`
- `Pacific/Honolulu`

## Africa

- `Africa/Cairo`
- `Africa/Johannesburg`
- `Africa/Lagos`
- `Africa/Nairobi`
- `Africa/Casablanca`

## 기타 지원 형식 (UTC 오프셋)

IANA 타임존 대신 아래 UTC 오프셋 직접 입력도 지원합니다.

- `+0900`
- `+09:00`
- `-0530`
- `-05:30`

> DST(서머타임) 자동 반영이 필요하면 오프셋 대신 IANA 타임존을 사용하세요.
