export interface ApiKey {
    seq: number;
    key_value: string; // 조회 시 앞 8자리만 노출 (예: "abcd1234...")
    hmac_secret?: string; // 생성/재생성 시에만 평문 반환, 이후 "***"
    role: string;
    description?: string;
    enabled: boolean;
    account_seq?: number | null; // 연결된 사용자 seq (nullable)
    entities?: string; // JSON 배열 문자열 (e.g. '["*"]')
    created_time?: string;
    updated_time?: string;
    deleted_time?: string | null;
}

/** 생성/재생성 응답 (평문 포함) */
export interface ApiKeyCreatedResponse extends ApiKey {
    key_value: string; // 생성 시 평문 전체
    hmac_secret: string; // 생성 시 평문 전체
}
