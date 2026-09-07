/**
 * Entity Server 클라이언트 (Kotlin / Android)
 *
 * 의존성 (build.gradle):
 *   implementation("org.bouncycastle:bcprov-jdk18on:1.80")
 *
 * 환경 설정:
 *   val client = EntityServerClient(
 *       baseUrl    = "http://your-server:47200",
 *       apiKey     = BuildConfig.ENTITY_API_KEY,
 *       hmacSecret = BuildConfig.ENTITY_HMAC_SECRET
 *   )
 *
 * 트랜잭션 사용 예:
 *   es.transStart()
 *   try {
 *     val orderRef  = es.submit("order", JSONObject(mapOf("user_seq" to 1, "total" to 9900))) // seq: "\$tx.0"
 *     es.submit("order_item", JSONObject(mapOf("order_seq" to orderRef.getString("seq"), "item_seq" to 5))) // "\$tx.0" 자동 치환
 *     val result    = es.transCommit()
 *     val orderSeq  = (result.getJSONArray("results")).getJSONObject(0).getLong("seq") // 실제 seq
 *   } catch (e: Exception) {
 *     es.transRollback()
 *   }
 */

package com.example.entityserver

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.bouncycastle.crypto.engines.ChaCha7539Engine
import org.bouncycastle.crypto.modes.ChaChaEngine
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.ParametersWithIV
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.digests.SHA256Digest
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class EntityServerClient(
    private val baseUrl: String = "http://localhost:47200",
    private val apiKey: String = "",
    private val hmacSecret: String = "",
    private var token: String = "",
    /** true 이면 POST 요청 바디를 XChaCha20-Poly1305로 암호화합니다. */
    private var encryptRequests: Boolean = false,
) {
    private val http = OkHttpClient()
    private var activeTxId: String? = null    private var packetEncryption: Boolean = false

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    fun setToken(newToken: String) { token = newToken }

    /**
     * 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
     * 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
     */
    fun checkHealth(): JSONObject {
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + "/v1/health")
            .get()
            .build()
        val res = http.newCall(req).execute()
        val body = JSONObject(res.body?.string() ?: "{}")
        if (body.optBoolean("packet_encryption", false)) {
            packetEncryption = true
        }
        return body
    }
    // ─── CRUD ─────────────────────────────────────────────────────────

    fun get(entity: String, seq: Long, skipHooks: Boolean = false): JSONObject {
        val q = if (skipHooks) "?skipHooks=true" else ""
        return request("GET", "/v1/entity/$entity/$seq$q")
    }

    /**
     * 조건으로 단건 조회 (POST + conditions body)
     *
     * @param conditions 필터 조건. index/hash/unique 필드만 사용 가능
     * @param skipHooks  after_find 훅 미실행 여부
     */
    fun find(entity: String, conditions: JSONObject, skipHooks: Boolean = false): JSONObject {
        val q = if (skipHooks) "?skipHooks=true" else ""
        return request("POST", "/v1/entity/$entity/find$q", conditions.toString())
    }

    /**
     * 목록 조회 (POST + conditions body)
     * @param orderBy    정렬 기준 필드명. null 이면 기본 정렬. - 접두사로 내림차순
     * @param fields     반환 필드 목록. 미지정 시 인덱스 필드만 반환 (기본, 가장 빠름). listOf("*") 지정 시 전체 필드 반환
     * @param conditions 필터 조건. index/hash/unique 필드만 사용 가능
     */
    fun list(
        entity: String,
        page: Int = 1,
        limit: Int = 20,
        orderBy: String? = null,
        fields: List<String>? = null,
        conditions: JSONObject? = null,
    ): JSONObject {
        val qParts = mutableListOf("page=$page", "limit=$limit")
        if (orderBy != null) qParts += "order_by=$orderBy"
        if (!fields.isNullOrEmpty()) qParts += "fields=${fields.joinToString(",")}"
        return request("POST", "/v1/entity/$entity/list?${qParts.joinToString("&")}", conditions?.toString() ?: "{}")
    }

    /** 건수 조회 */
    fun count(entity: String, conditions: JSONObject? = null): JSONObject =
        request("POST", "/v1/entity/$entity/count", conditions?.toString() ?: "{}")

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
     * @param sql     SELECT SQL문. 사용자 입력은 반드시 ? 로 바인딩 (SQL Injection 방지)
     * @param params  바인딩 파라미터 JSON 배열
     * @param limit   최대 반환 건수 (최대 1000. 0 이하이면 서버 기본값)
     */
    fun query(entity: String, sql: String, params: JSONArray? = null, limit: Int = 0): JSONObject {
        val body = JSONObject()
        body.put("sql", sql)
        body.put("params", params ?: JSONArray())
        if (limit > 0) body.put("limit", limit)
        return request("POST", "/v1/entity/$entity/query", body.toString())
    }

    /**
     * 트랜잭션 시작 — 서버에 큐를 등록하고 txId 를 저장합니다.
     * 이후 submit / delete 가 실제 실행되지 않고 서버 큐에 쌓입니다.
     * transCommit() 시 한 번에 DB 트랜잭션으로 실행됩니다.
     */
    fun transStart(): String {
        val res = request("POST", "/v1/transaction/start")
        activeTxId = res.getString("transaction_id")
        return activeTxId!!
    }

    /**
     * 트랜잭션 전체 롤백
     * transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
     */
    fun transRollback(transactionId: String? = null): JSONObject {
        val txId = transactionId ?: activeTxId
            ?: error("No active transaction. Call transStart() first.")
        activeTxId = null
        return request("POST", "/v1/transaction/rollback/$txId")
    }

    /**
     * 트랜잭션 커밋 — 큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 일괄 실행합니다.
     * transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 커밋합니다.
     */
    fun transCommit(transactionId: String? = null): JSONObject {
        val txId = transactionId ?: activeTxId
            ?: error("No active transaction. Call transStart() first.")
        activeTxId = null
        return request("POST", "/v1/transaction/commit/$txId")
    }

    /** 생성 또는 수정 (seq 포함시 수정, 없으면 생성) */
    fun submit(entity: String, data: JSONObject, transactionId: String? = null, skipHooks: Boolean = false): JSONObject {
        val txId = transactionId ?: activeTxId
        val extra = if (txId != null) mapOf("X-Transaction-ID" to txId) else emptyMap()
        val q = if (skipHooks) "?skipHooks=true" else ""
        return request("POST", "/v1/entity/$entity/submit$q", data.toString(), extra)
    }

    /** 삭제 */
    /** 삭제. 서버는 POST /delete/:seq 로만 처리합니다. */
    fun delete(entity: String, seq: Long, transactionId: String? = null, hard: Boolean = false, skipHooks: Boolean = false): JSONObject {
        val qParts = mutableListOf<String>()
        if (hard) qParts += "hard=true"
        if (skipHooks) qParts += "skipHooks=true"
        val q = if (qParts.isNotEmpty()) "?" + qParts.joinToString("&") else ""
        val txId = transactionId ?: activeTxId
        val extra = if (txId != null) mapOf("X-Transaction-ID" to txId) else emptyMap()
        return request("POST", "/v1/entity/$entity/delete/$seq$q", extraHeaders = extra)
    }

    fun history(entity: String, seq: Long, page: Int = 1, limit: Int = 50): JSONObject =
        request("GET", "/v1/entity/$entity/history/$seq?page=$page&limit=$limit")

    fun rollback(entity: String, historySeq: Long): JSONObject =
        request("POST", "/v1/entity/$entity/rollback/$historySeq")

    /** 푸시 발송 트리거 엔티티에 submit합니다. */
    fun push(pushEntity: String, payload: JSONObject, transactionId: String? = null): JSONObject =
        submit(pushEntity, payload, transactionId)

    /** push_log 목록 조회 헬퍼 */
    fun pushLogList(page: Int = 1, limit: Int = 20): JSONObject =
        list("push_log", page, limit)

    /** account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드) */
    fun registerPushDevice(
        accountSeq: Long,
        deviceId: String,
        pushToken: String,
        platform: String? = null,
        deviceType: String? = null,
        pushEnabled: Boolean = true,
        transactionId: String? = null,
    ): JSONObject {
        val payload = JSONObject().apply {
            put("id", deviceId)
            put("account_seq", accountSeq)
            put("push_token", pushToken)
            put("push_enabled", pushEnabled)
            if (!platform.isNullOrBlank()) put("platform", platform)
            if (!deviceType.isNullOrBlank()) put("device_type", deviceType)
        }
        return submit("account_device", payload, transactionId)
    }

    /** account_device.seq 기준 push_token 갱신 헬퍼 */
    fun updatePushDeviceToken(
        deviceSeq: Long,
        pushToken: String,
        pushEnabled: Boolean = true,
        transactionId: String? = null,
    ): JSONObject =
        submit(
            "account_device",
            JSONObject().apply {
                put("seq", deviceSeq)
                put("push_token", pushToken)
                put("push_enabled", pushEnabled)
            },
            transactionId,
        )

    /** account_device.seq 기준 푸시 수신 비활성화 헬퍼 */
    fun disablePushDevice(
        deviceSeq: Long,
        transactionId: String? = null,
    ): JSONObject =
        submit(
            "account_device",
            JSONObject().apply {
                put("seq", deviceSeq)
                put("push_enabled", false)
            },
            transactionId,
        )

    /**
     * 요청 본문을 읽어 JSON으로 반환합니다.
     * - application/octet-stream: 암호 패킷 복호화
     * - 그 외: 평문 JSON 파싱
     */
    fun readRequestBody(
        rawBody: ByteArray,
        contentType: String = "application/json",
        requireEncrypted: Boolean = false,
    ): JSONObject {
        val lowered = contentType.lowercase()
        val isEncrypted = lowered.contains("application/octet-stream")

        if (requireEncrypted && !isEncrypted) {
            error("Encrypted request required: Content-Type must be application/octet-stream")
        }

        if (isEncrypted) {
            if (rawBody.isEmpty()) error("Encrypted request body is empty")
            return JSONObject(decryptPacket(rawBody))
        }

        if (rawBody.isEmpty()) return JSONObject()
        return JSONObject(String(rawBody, Charsets.UTF_8))
    }

    // ─── 내부 ─────────────────────────────────────────────────────────

    private fun request(method: String, path: String, bodyStr: String = "", extraHeaders: Map<String, String> = emptyMap()): JSONObject {
        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화
        val bodyBytes: ByteArray
        val contentType: String
        if ((encryptRequests || packetEncryption) && bodyStr.isNotEmpty()) {
            bodyBytes   = encryptPacket(bodyStr.toByteArray(Charsets.UTF_8))
            contentType = "application/octet-stream"
        } else {
            bodyBytes   = bodyStr.toByteArray(Charsets.UTF_8)
            contentType = "application/json"
        }

        val timestamp = (System.currentTimeMillis() / 1000).toString()
        val nonce = UUID.randomUUID().toString()
        val signature = sign(method, path, timestamp, nonce, bodyBytes)

        val isHmacMode = apiKey.isNotEmpty() && hmacSecret.isNotEmpty()

        val requestBuilder = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .addHeader("Content-Type", contentType)
            .apply {
                if (isHmacMode) {
                    addHeader("X-API-Key",   apiKey)
                    addHeader("X-Timestamp", timestamp)
                    addHeader("X-Nonce",     nonce)
                    addHeader("X-Signature", signature)
                } else if (token.isNotEmpty()) {
                    addHeader("Authorization", "Bearer $token")
                }
                extraHeaders.forEach { (k, v) -> addHeader(k, v) }
            }

        val reqBody = if (bodyBytes.isNotEmpty())
            bodyBytes.toRequestBody(contentType.toMediaType())
        else null

        val req = when (method.uppercase()) {
            "GET"    -> requestBuilder.get().build()
            "DELETE" -> requestBuilder.delete(reqBody).build()
            else     -> requestBuilder.method(method.uppercase(), reqBody).build()
        }

        val res = http.newCall(req).execute()
        val resContentType = res.header("Content-Type") ?: ""
        val rawBytes = res.body?.bytes() ?: byteArrayOf()

        // 패킷 암호화 응답: application/octet-stream → 복호화
        return if (resContentType.contains("application/octet-stream")) {
            JSONObject(decryptPacket(rawBytes))
        } else {
            JSONObject(String(rawBytes, Charsets.UTF_8))
        }
    }

    /**
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    private fun derivePacketKey(): ByteArray {
        if (token.isNotEmpty() && hmacSecret.isEmpty()) {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            return digest.digest(token.toByteArray(Charsets.UTF_8))
        }
        val gen = HKDFBytesGenerator(SHA256Digest())
        gen.init(HKDFParameters(
            hmacSecret.toByteArray(Charsets.UTF_8),
            "entity-server:hkdf:v1".toByteArray(Charsets.UTF_8),
            "entity-server:packet-encryption".toByteArray(Charsets.UTF_8),
        ))
        val key = ByteArray(32)
        gen.generateBytes(key, 0, 32)
        return key
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * magicLen: 2 + key[31] % 14
     */
    private fun encryptPacket(plaintext: ByteArray): ByteArray {
        val key   = derivePacketKey()
        val magicLen = 2 + (key[31].toInt() and 0xFF) % 14
        val magic = ByteArray(magicLen).also { SecureRandom().nextBytes(it) }
        val nonce = ByteArray(24).also { SecureRandom().nextBytes(it) }

        val aead = org.bouncycastle.crypto.modes.ChaCha20Poly1305()
        aead.init(true, org.bouncycastle.crypto.params.AEADParameters(
            KeyParameter(key), 128, nonce
        ))
        val ciphertext = ByteArray(aead.getOutputSize(plaintext.size))
        val len = aead.processBytes(plaintext, 0, plaintext.size, ciphertext, 0)
        aead.doFinal(ciphertext, len)
        return magic + nonce + ciphertext
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     */
    private fun decryptPacket(data: ByteArray): String {
        val key = derivePacketKey()
        val magicLen = 2 + (key[31].toInt() and 0xFF) % 14
        val nonce = data.copyOfRange(magicLen, magicLen + 24)
        val ciphertext = data.copyOfRange(magicLen + 24, data.size)

        val aead = org.bouncycastle.crypto.modes.ChaCha20Poly1305()
        aead.init(false, org.bouncycastle.crypto.params.AEADParameters(
            KeyParameter(key), 128, nonce
        ))

        val plaintext = ByteArray(aead.getOutputSize(ciphertext.size))
        val len = aead.processBytes(ciphertext, 0, ciphertext.size, plaintext, 0)
        aead.doFinal(plaintext, len)
        return plaintext.toString(Charsets.UTF_8)
    }

    /**
     * HMAC-SHA256 서명
     * bodyBytes 는 JSON 바이트 또는 암호화된 바리두 모두 지원합니다.
     */
    private fun sign(method: String, path: String, timestamp: String, nonce: String, bodyBytes: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(hmacSecret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val prefix = "$method|$path|$timestamp|$nonce|".toByteArray(Charsets.UTF_8)
        mac.update(prefix)
        if (bodyBytes.isNotEmpty()) mac.update(bodyBytes)
        return mac.doFinal().joinToString("") { "%02x".format(it) }
    }
