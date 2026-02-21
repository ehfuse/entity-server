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
 *       hmacSecret = BuildConfig.ENTITY_HMAC_SECRET,
 *       magicLen   = 4   // 서버 packet_magic_len 과 동일
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
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class EntityServerClient(
    private val baseUrl: String = "http://localhost:47200",
    private val apiKey: String = "",
    private val hmacSecret: String = "",
    private val magicLen: Int = 4,
) {
    private val http = OkHttpClient()
    private var activeTxId: String? = null

    // ─── CRUD ─────────────────────────────────────────────────────────

    fun get(entity: String, seq: Long): JSONObject =
        request("GET", "/v1/entity/$entity/$seq")

    fun list(entity: String, page: Int = 1, limit: Int = 20): JSONObject =
        request("GET", "/v1/entity/$entity/list?page=$page&limit=$limit")

    fun count(entity: String): JSONObject =
        request("GET", "/v1/entity/$entity/count")

    fun query(entity: String, filter: JSONArray, page: Int = 1, limit: Int = 20): JSONObject =
        request("POST", "/v1/entity/$entity/query?page=$page&limit=$limit", filter.toString())

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
    fun submit(entity: String, data: JSONObject, transactionId: String? = null): JSONObject {
        val txId = transactionId ?: activeTxId
        val extra = if (txId != null) mapOf("X-Transaction-ID" to txId) else emptyMap()
        return request("POST", "/v1/entity/$entity/submit", data.toString(), extra)
    }

    /** 삭제 */
    fun delete(entity: String, seq: Long, transactionId: String? = null, hard: Boolean = false): JSONObject {
        val q = if (hard) "?hard=true" else ""
        val txId = transactionId ?: activeTxId
        val extra = if (txId != null) mapOf("X-Transaction-ID" to txId) else emptyMap()
        return request("DELETE", "/v1/entity/$entity/delete/$seq$q", extraHeaders = extra)
    }

    fun history(entity: String, seq: Long, page: Int = 1, limit: Int = 50): JSONObject =
        request("GET", "/v1/entity/$entity/history/$seq?page=$page&limit=$limit")

    fun rollback(entity: String, historySeq: Long): JSONObject =
        request("POST", "/v1/entity/$entity/rollback/$historySeq")

    // ─── 내부 ─────────────────────────────────────────────────────────

    private fun request(method: String, path: String, bodyStr: String = "", extraHeaders: Map<String, String> = emptyMap()): JSONObject {
        val timestamp = (System.currentTimeMillis() / 1000).toString()
        val nonce = UUID.randomUUID().toString()
        val signature = sign(method, path, timestamp, nonce, bodyStr)

        val requestBuilder = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-API-Key", apiKey)
            .addHeader("X-Timestamp", timestamp)
            .addHeader("X-Nonce", nonce)
            .addHeader("X-Signature", signature)
            .apply { extraHeaders.forEach { (k, v) -> addHeader(k, v) } }

        val body = if (bodyStr.isNotEmpty())
            bodyStr.toRequestBody("application/json".toMediaType())
        else null

        val req = when (method.uppercase()) {
            "GET"    -> requestBuilder.get().build()
            "DELETE" -> requestBuilder.delete(body).build()
            else     -> requestBuilder.method(method.uppercase(), body).build()
        }

        val res = http.newCall(req).execute()
        val contentType = res.header("Content-Type") ?: ""
        val rawBytes = res.body?.bytes() ?: byteArrayOf()

        // 패킷 암호화 응답: application/octet-stream → 복호화
        return if (contentType.contains("application/octet-stream")) {
            JSONObject(decryptPacket(rawBytes))
        } else {
            JSONObject(String(rawBytes, Charsets.UTF_8))
        }
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     *
     * Bouncy Castle XChaCha20-Poly1305 사용
     */
    private fun decryptPacket(data: ByteArray): String {
        val key = sha256(hmacSecret.toByteArray(Charsets.UTF_8))

        val nonce = data.copyOfRange(magicLen, magicLen + 24)
        val ciphertext = data.copyOfRange(magicLen + 24, data.size)

        // Bouncy Castle: XChaCha20-Poly1305 (AEAD)
        val aead = org.bouncycastle.crypto.modes.ChaCha20Poly1305()
        aead.init(false, org.bouncycastle.crypto.params.AEADParameters(
            KeyParameter(key), 128, nonce
        ))

        val plaintext = ByteArray(aead.getOutputSize(ciphertext.size))
        val len = aead.processBytes(ciphertext, 0, ciphertext.size, plaintext, 0)
        aead.doFinal(plaintext, len)
        return plaintext.toString(Charsets.UTF_8)
    }

    /** HMAC-SHA256 서명 */
    private fun sign(method: String, path: String, timestamp: String, nonce: String, body: String): String {
        val payload = listOf(method, path, timestamp, nonce, body).joinToString("|")
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(hmacSecret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun sha256(input: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(input)
}
