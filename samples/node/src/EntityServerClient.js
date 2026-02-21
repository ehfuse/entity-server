/**
 * Entity Server 클라이언트 (Node.js)
 *
 * 의존성: Node.js 18+, @noble/ciphers, @noble/hashes
 *   npm install @noble/ciphers @noble/hashes
 *
 * 환경변수:
 *   ENTITY_SERVER_URL          http://localhost:47200
 *   ENTITY_SERVER_API_KEY      your-api-key
 *   ENTITY_SERVER_HMAC_SECRET  your-hmac-secret
 *   ENTITY_SERVER_MAGIC_LEN    4  (서버 packet_magic_len 과 동일하게)
 *
 * 사용 예:
 *   const es = new EntityServerClient();
 *   const list = await es.list('account', { page: 1, limit: 20 });
 *   const seq  = await es.submit('account', { name: '홍길동' });
 *
 * 트랜잭션 사용 예:
 *   await es.transStart();
 *   try {
 *     const orderRef  = await es.submit('order', { ... });         // seq: "$tx.0"
 *     await es.submit('order_item', { order_seq: orderRef.seq });  // "$tx.0" 자동 치환
 *     const result = await es.transCommit();
 *     const orderSeq = result.results[0].seq;  // 실제 seq
 *   } catch (e) {
 *     await es.transRollback();
 *   }
 */

import { createHmac, randomUUID } from "crypto";
import { xchacha20_poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";

export class EntityServerClient {
    #baseUrl;
    #apiKey;
    #hmacSecret;
    #magicLen;
    #activeTxId = null;

    constructor({
        baseUrl = process.env.ENTITY_SERVER_URL ?? "http://localhost:47200",
        apiKey = process.env.ENTITY_SERVER_API_KEY ?? "",
        hmacSecret = process.env.ENTITY_SERVER_HMAC_SECRET ?? "",
        magicLen = Number(process.env.ENTITY_SERVER_MAGIC_LEN ?? "4"),
    } = {}) {
        this.#baseUrl = baseUrl.replace(/\/$/, "");
        this.#apiKey = apiKey;
        this.#hmacSecret = hmacSecret;
        this.#magicLen = magicLen > 0 ? magicLen : 4;
    }

    // ─── 트랜잭션 ─────────────────────────────────────────────────────────────

    /**
     * 트랜잭션 시작 — 서버에 트랜잭션 큐를 등록하고 transaction_id 를 반환합니다.
     * 이후 submit / delete 가 서버 큐에 쌓이고 transCommit() 시 일괄 처리됩니다.
     * @returns {Promise<string>} transaction_id
     */
    async transStart() {
        const res = await this.#request("POST", "/v1/transaction/start");
        this.#activeTxId = res.transaction_id;
        return this.#activeTxId;
    }

    /**
     * 트랜잭션 단위로 변경사항을 롤백합니다.
     * @param {string} [transactionId]  생략 시 transStart() 로 시작한 활성 트랜잭션 사용
     */
    transRollback(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/rollback/${txId}`);
    }

    /**
     * 트랜잭션 커밋 — 서버 큐에 쌓인 작업들을 단일 DB 트랜잭션으로 일괄 처리합니다.
     * @param {string} [transactionId]  생략 시 transStart() 로 시작한 활성 트랜잭션 사용
     */
    transCommit(transactionId) {
        const txId = transactionId ?? this.#activeTxId;
        if (!txId)
            throw new Error("No active transaction. Call transStart() first.");
        this.#activeTxId = null;
        return this.#request("POST", `/v1/transaction/commit/${txId}`);
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /** 단건 조회 */
    get(entity, seq) {
        return this.#request("GET", `/v1/entity/${entity}/${seq}`);
    }

    /** 목록 조회 */
    list(entity, { page = 1, limit = 20, orderBy } = {}) {
        const q = new URLSearchParams({
            page,
            limit,
            ...(orderBy && { order_by: orderBy }),
        });
        return this.#request("GET", `/v1/entity/${entity}/list?${q}`);
    }

    /** 건수 조회 */
    count(entity) {
        return this.#request("GET", `/v1/entity/${entity}/count`);
    }

    /**
     * 필터 검색
     * @param {Array}  filter  예: [{ field: 'status', op: 'eq', value: 'active' }]
     * @param {Object} params  예: { page: 1, limit: 20, orderBy: 'name' }
     */
    query(entity, filter = [], { page = 1, limit = 20, orderBy } = {}) {
        const q = new URLSearchParams({
            page,
            limit,
            ...(orderBy && { order_by: orderBy }),
        });
        return this.#request("POST", `/v1/entity/${entity}/query?${q}`, filter);
    }

    /**
     * 생성 또는 수정
     * body에 seq 포함 시 수정, 없으면 생성
     * @param {string} entity
     * @param {Object} data
     * @param {Object} [opts]
     * @param {string} [opts.transactionId]  transStart() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
     */
    submit(entity, data, { transactionId } = {}) {
        const txId = transactionId ?? this.#activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        return this.#request(
            "POST",
            `/v1/entity/${entity}/submit`,
            data,
            extra,
        );
    }

    /**
     * 삭제
     * @param {string} entity
     * @param {number} seq
     * @param {Object} [opts]
     * @param {string} [opts.transactionId]  transStart() 가 반환한 ID (생략 시 활성 트랜잭션 자동 사용)
     * @param {boolean} [opts.hard]           하드 삭제 여부 (기본 false)
     */
    delete(entity, seq, { transactionId, hard = false } = {}) {
        const q = hard ? "?hard=true" : "";
        const txId = transactionId ?? this.#activeTxId;
        const extra = txId ? { "X-Transaction-ID": txId } : {};
        return this.#request(
            "DELETE",
            `/v1/entity/${entity}/delete/${seq}${q}`,
            null,
            extra,
        );
    }

    /** 변경 이력 조회 */
    history(entity, seq, { page = 1, limit = 50 } = {}) {
        return this.#request(
            "GET",
            `/v1/entity/${entity}/history/${seq}?page=${page}&limit=${limit}`,
        );
    }

    /** history seq 단위 롤백 (단건) */
    rollback(entity, historySeq) {
        return this.#request(
            "POST",
            `/v1/entity/${entity}/rollback/${historySeq}`,
        );
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    async #request(method, path, body, extraHeaders = {}) {
        const bodyStr = body != null ? JSON.stringify(body) : "";
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomUUID();
        const signature = this.#sign(method, path, timestamp, nonce, bodyStr);

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": this.#apiKey,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
            "X-Signature": signature,
            ...extraHeaders,
        };

        const res = await fetch(this.#baseUrl + path, {
            method,
            headers,
            ...(bodyStr ? { body: bodyStr } : {}),
        });

        const contentType = res.headers.get("Content-Type") ?? "";

        // 패킷 암호화 응답: application/octet-stream → 복호화
        if (contentType.includes("application/octet-stream")) {
            const buffer = await res.arrayBuffer();
            return this.#decryptPacket(buffer);
        }

        const data = await res.json();

        if (!data.ok) {
            throw new Error(
                `EntityServer error: ${data.message ?? "Unknown"} (HTTP ${res.status})`,
            );
        }
        return data;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     */
    #decryptPacket(buffer) {
        const key = sha256(new TextEncoder().encode(this.#hmacSecret));
        const data = new Uint8Array(buffer);
        const nonce = data.slice(this.#magicLen, this.#magicLen + 24);
        const ciphertext = data.slice(this.#magicLen + 24);
        const cipher = xchacha20_poly1305(key, nonce);
        const plaintext = cipher.decrypt(ciphertext);
        return JSON.parse(new TextDecoder().decode(plaintext));
    }

    /** HMAC-SHA256 서명 */
    #sign(method, path, timestamp, nonce, body) {
        const payload = [method, path, timestamp, nonce, body].join("|");
        return createHmac("sha256", this.#hmacSecret)
            .update(payload)
            .digest("hex");
    }
}

export default EntityServerClient;
