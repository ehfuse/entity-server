/**
 * Entity Server API 클라이언트 (React / 브라우저)
 *
 * 브라우저 환경에서는 HMAC secret을 노출할 수 없으므로 JWT Bearer 토큰 방식을 사용합니다.
 *
 * 패킷 암호화 지원:
 *   서버가 application/octet-stream 으로 응답하면 자동으로 복호화합니다.
 *   복호화 키: sha256(access_token)
 *   의존성: @noble/ciphers, @noble/hashes  (npm install @noble/ciphers @noble/hashes)
 *
 * 환경변수 (Vite):
 *   VITE_ENTITY_SERVER_URL=http://localhost:47200
 *   VITE_PACKET_MAGIC_LEN=4  (서버 packet_magic_len 과 동일하게)
 *
 * 트랜잭션 사용 예:
 *   await es.transStart();
 *   try {
 *     const orderRef  = await es.submit('order', { user_seq: 1, total: 9900 });        // seq: "$tx.0"
 *     await es.submit('order_item', { order_seq: orderRef.seq, item_seq: 5 });          // "$tx.0" 자동 치환
 *     const result    = await es.transCommit();
 *     const orderSeq  = result.results[0].seq;                                          // 실제 seq
 *   } catch (e) {
 *     await es.transRollback();
 *   }
 */

import { xchacha20_poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";

export interface EntityListParams {
    page?: number;
    limit?: number;
    orderBy?: string;
}

export interface EntityQueryFilter {
    field: string;
    op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "like" | "in";
    value: unknown;
}

export class EntityServerClient {
    private baseUrl: string;
    private token: string;
    private magicLen: number;
    private activeTxId: string | null = null;

    constructor(baseUrl?: string, token?: string) {
        this.baseUrl = (
            baseUrl ??
            (import.meta as unknown as Record<string, Record<string, string>>)
                .env?.VITE_ENTITY_SERVER_URL ??
            "http://localhost:47200"
        ).replace(/\/$/, "");
        this.token = token ?? "";
        const envMagic = (
            import.meta as unknown as Record<string, Record<string, string>>
        ).env?.VITE_PACKET_MAGIC_LEN;
        this.magicLen = envMagic ? Number(envMagic) : 4;
    }

    setToken(token: string): void {
        this.token = token;
    }

    // ─── 인증 ────────────────────────────────────────────────────────────────

    async login(
        email: string,
        password: string,
    ): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }> {
        const data = await this.request<{
            data: {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };
        }>("POST", "/v1/auth/login", { email, passwd: password }, false);
        this.token = data.data.access_token;
        return data.data;
    }

    async refreshToken(
        refreshToken: string,
    ): Promise<{ access_token: string; expires_in: number }> {
        const data = await this.request<{
            data: { access_token: string; expires_in: number };
        }>("POST", "/v1/auth/refresh", { refresh_token: refreshToken }, false);
        this.token = data.data.access_token;
        return data.data;
    }

    // ─── 트랜잭션 ──────────────────────────────────────────────────────────────

    /**
     * 트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
     * 이후 submit / delete 가 서버 큐에 쌓이고 transCommit() 시 일괄 처리됩니다.
     */
    async transStart(): Promise<string> {
        const res = await this.request<{ ok: boolean; transaction_id: string }>(
            "POST",
            "/v1/transaction/start",
            undefined,
            false,
        );
        this.activeTxId = res.transaction_id;
        return this.activeTxId;
    }

    /**
     * 트랜잭션 단위로 변경사항을 롤백합니다.
     * transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 사용합니다.
     */
    transRollback(transactionId?: string): Promise<{ ok: boolean }> {
        const txId = transactionId ?? this.activeTxId;
        if (!txId)
            return Promise.reject(
                new Error("No active transaction. Call transStart() first."),
            );
        this.activeTxId = null;
        return this.request("POST", `/v1/transaction/rollback/${txId}`);
    }

    /**
     * 트랜잭션 커밋 — 서버 큐에 쌓인 작업을 단일 DB 트랜잭션으로 일괄 처리합니다.
     * transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 사용합니다.
     */
    transCommit(
        transactionId?: string,
    ): Promise<{ ok: boolean; results: unknown[] }> {
        const txId = transactionId ?? this.activeTxId;
        if (!txId)
            return Promise.reject(
                new Error("No active transaction. Call transStart() first."),
            );
        this.activeTxId = null;
        return this.request("POST", `/v1/transaction/commit/${txId}`);
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    get<T = unknown>(
        entity: string,
        seq: number,
    ): Promise<{ ok: boolean; data: T }> {
        return this.request("GET", `/v1/entity/${entity}/${seq}`);
    }

    list<T = unknown>(
        entity: string,
        params: EntityListParams = {},
    ): Promise<{ ok: boolean; data: T[]; total: number }> {
        const q = buildQuery({ page: 1, limit: 20, ...params });
        return this.request("GET", `/v1/entity/${entity}/list?${q}`);
    }

    count(entity: string): Promise<{ ok: boolean; count: number }> {
        return this.request("GET", `/v1/entity/${entity}/count`);
    }

    query<T = unknown>(
        entity: string,
        filter: EntityQueryFilter[] = [],
        params: EntityListParams = {},
    ): Promise<{ ok: boolean; data: T[]; total: number }> {
        const q = buildQuery({ page: 1, limit: 20, ...params });
        return this.request("POST", `/v1/entity/${entity}/query?${q}`, filter);
    }

    submit<T = unknown>(
        entity: string,
        data: Record<string, unknown>,
        opts: { transactionId?: string } = {},
    ): Promise<{ ok: boolean; seq?: number; data?: T }> {
        const txId = opts.transactionId ?? this.activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        return this.request(
            "POST",
            `/v1/entity/${entity}/submit`,
            data,
            true,
            extra,
        );
    }

    delete(
        entity: string,
        seq: number,
        opts: { transactionId?: string; hard?: boolean } = {},
    ): Promise<{ ok: boolean }> {
        const q = opts.hard ? "?hard=true" : "";
        const txId = opts.transactionId ?? this.activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        return this.request(
            "DELETE",
            `/v1/entity/${entity}/delete/${seq}${q}`,
            undefined,
            true,
            extra,
        );
    }

    history<T = unknown>(
        entity: string,
        seq: number,
        params: EntityListParams = {},
    ): Promise<{ ok: boolean; data: T[] }> {
        const q = buildQuery({ page: 1, limit: 50, ...params });
        return this.request("GET", `/v1/entity/${entity}/history/${seq}?${q}`);
    }

    rollback(entity: string, historySeq: number): Promise<{ ok: boolean }> {
        return this.request(
            "POST",
            `/v1/entity/${entity}/rollback/${historySeq}`,
        );
    }

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        withAuth = true,
        extraHeaders: Record<string, string> = {},
    ): Promise<T> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...extraHeaders,
        };
        if (withAuth && this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }

        const res = await fetch(this.baseUrl + path, {
            method,
            headers,
            ...(body != null ? { body: JSON.stringify(body) } : {}),
        });

        const contentType = res.headers.get("Content-Type") ?? "";

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if (contentType.includes("application/octet-stream")) {
            const buffer = await res.arrayBuffer();
            return this.decryptPacket<T>(buffer);
        }

        const data = await res.json();
        if (!data.ok) {
            const err = new Error(
                data.message ?? `EntityServer error (HTTP ${res.status})`,
            );
            (err as { status?: number }).status = res.status;
            throw err;
        }
        return data as T;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(access_token)
     */
    private decryptPacket<T>(buffer: ArrayBuffer): T {
        const key = sha256(new TextEncoder().encode(this.token));
        const data = new Uint8Array(buffer);
        const nonce = data.slice(this.magicLen, this.magicLen + 24);
        const ciphertext = data.slice(this.magicLen + 24);
        const cipher = xchacha20_poly1305(key, nonce);
        const plaintext = cipher.decrypt(ciphertext);
        return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    }
}

function buildQuery(params: Record<string, unknown>): string {
    return Object.entries(params)
        .filter(([, v]) => v != null)
        .map(
            ([k, v]) =>
                `${encodeURIComponent(k === "orderBy" ? "order_by" : k)}=${encodeURIComponent(String(v))}`,
        )
        .join("&");
}

/** 싱글턴 인스턴스 (앱 전체 공유) */
export const entityServer = new EntityServerClient();
