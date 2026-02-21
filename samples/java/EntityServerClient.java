package com.example.entityserver;

import org.bouncycastle.crypto.modes.ChaCha20Poly1305;
import org.bouncycastle.crypto.params.AEADParameters;
import org.bouncycastle.crypto.params.KeyParameter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Entity Server 클라이언트 (Java)
 *
 * 의존성 (build.gradle / pom.xml):
 *   implementation("org.bouncycastle:bcprov-jdk18on:1.80")   // XChaCha20-Poly1305
 *
 * 환경변수 또는 생성자로 설정:
 *   ENTITY_SERVER_URL         http://localhost:47200
 *   ENTITY_SERVER_API_KEY     your-api-key
 *   ENTITY_SERVER_HMAC_SECRET your-hmac-secret
 *   ENTITY_PACKET_MAGIC_LEN   4   (서버 packet_magic_len 과 동일)
 *
 * 사용 예:
 *   EntityServerClient es = new EntityServerClient();
 *   String result = es.get("account", 1);
 *   String list   = es.list("account", 1, 20, null);
 *   String seq    = es.submit("account", "{\"name\":\"홍길동\"}");
 *
 * 반환값은 JSON 문자열입니다. Gson / Jackson 등으로 파싱하세요.
 *
 * 트랜잭션 사용 예:
 *   es.transStart();
 *   try {
 *     String orderJson = es.submit("order", "{\"user_seq\":1,\"total\":9900}"); // seq: "$tx.0"
 *     // Gson 파싱 후 orderRef["seq"] 가 "$tx.0" — commit 시 실제 값으로 치환됨
 *     es.submit("order_item", "{\"order_seq\":\"$tx.0\",\"item_seq\":5}");   // "$tx.0" 자동 치환
 *     String commitResult = es.transCommit();
 *     // commitResult["results"][0]["seq"] 가 실제 order seq
 *   } catch (Exception e) {
 *     es.transRollback();
 *   }
 */
public class EntityServerClient {

    private final String baseUrl;
    private final String apiKey;
    private final String hmacSecret;
    private final int    timeoutMs;
    private final int    magicLen;
    private       String activeTxId = null;

    public EntityServerClient() {
        this(
            getEnv("ENTITY_SERVER_URL",         "http://localhost:47200"),
            getEnv("ENTITY_SERVER_API_KEY",     ""),
            getEnv("ENTITY_SERVER_HMAC_SECRET", ""),
            10_000,
            Integer.parseInt(getEnv("ENTITY_PACKET_MAGIC_LEN", "4"))
        );
    }

    public EntityServerClient(String baseUrl, String apiKey, String hmacSecret, int timeoutMs, int magicLen) {
        this.baseUrl    = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey     = apiKey;
        this.hmacSecret = hmacSecret;
        this.timeoutMs  = timeoutMs;
        this.magicLen   = magicLen;
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /** 단건 조회 */
    public String get(String entity, long seq) throws IOException {
        return request("GET", "/v1/entity/" + entity + "/" + seq, null);
    }

    /** 목록 조회 */
    public String list(String entity, int page, int limit, String orderBy) throws IOException {
        String query = "?page=" + page + "&limit=" + limit + (orderBy != null ? "&order_by=" + orderBy : "");
        return request("GET", "/v1/entity/" + entity + "/list" + query, null);
    }

    /** 건수 조회 */
    public String count(String entity) throws IOException {
        return request("GET", "/v1/entity/" + entity + "/count", null);
    }

    /**
     * 필터 검색
     * @param filterJson JSON 배열 문자열. 예: [{"field":"status","op":"eq","value":"active"}]
     */
    public String query(String entity, String filterJson, int page, int limit) throws IOException {
        String query = "?page=" + page + "&limit=" + limit;
        return request("POST", "/v1/entity/" + entity + "/query" + query, filterJson);
    }

    /**
     * 트랜잭션 시작 — 서버에 큐를 등록하고 txId 를 저장합니다.
     * 이후 submit / delete 가 실제 실행되지 않고 서버 큐에 쌓입니다.
     * transCommit() 시 한 번에 DB 트랜잭션으로 실행됩니다.
     */
    public String transStart() throws IOException {
        String json = request("POST", "/v1/transaction/start", null, Collections.emptyMap());
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("\"transaction_id\"\\s*:\\s*\"([^\"]+)\"")
            .matcher(json);
        if (!m.find()) throw new IOException("transStart: transaction_id not found in response");
        activeTxId = m.group(1);
        return activeTxId;
    }

    /** 활성 트랜잭션 롤백 */
    public String transRollback() throws IOException {
        return transRollback(null);
    }

    /**
     * 트랜잭션 롤백
     * transactionId 가 null 이면 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
     */
    public String transRollback(String transactionId) throws IOException {
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId == null) throw new IllegalStateException("No active transaction. Call transStart() first.");
        activeTxId = null;
        return request("POST", "/v1/transaction/rollback/" + txId, null, Collections.emptyMap());
    }

    /** 트랜잭션 커밋 (activeTxId 사용) */
    public String transCommit() throws IOException {
        return transCommit(null);
    }

    /**
     * 트랜잭션 커밋 — 큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 일괄 실행합니다.
     * transactionId 가 null 이면 transStart() 로 시작한 활성 트랜잭션을 커밋합니다.
     */
    public String transCommit(String transactionId) throws IOException {
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId == null) throw new IllegalStateException("No active transaction. Call transStart() first.");
        activeTxId = null;
        return request("POST", "/v1/transaction/commit/" + txId, null, Collections.emptyMap());
    }

    /**
     * 생성 또는 수정
     * @param dataJson JSON 객체 문자열. seq 포함 시 수정, 없으면 생성.
     */
    public String submit(String entity, String dataJson) throws IOException {
        return submit(entity, dataJson, null);
    }

    /** 생성 또는 수정 (트랜잭션 지원) */
    public String submit(String entity, String dataJson, String transactionId) throws IOException {
        Map<String, String> extra = new HashMap<>();
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId != null) extra.put("X-Transaction-ID", txId);
        return request("POST", "/v1/entity/" + entity + "/submit", dataJson, extra);
    }

    /** 삭제 */
    public String delete(String entity, long seq) throws IOException {
        return delete(entity, seq, null, false);
    }

    /** 삭제 (트랜잭션 지원) */
    public String delete(String entity, long seq, String transactionId, boolean hard) throws IOException {
        String q = hard ? "?hard=true" : "";
        Map<String, String> extra = new HashMap<>();
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId != null) extra.put("X-Transaction-ID", txId);
        return request("DELETE", "/v1/entity/" + entity + "/delete/" + seq + q, null, extra);
    }

    /** 변경 이력 조회 */
    public String history(String entity, long seq, int page, int limit) throws IOException {
        String query = "?page=" + page + "&limit=" + limit;
        return request("GET", "/v1/entity/" + entity + "/history/" + seq + query, null);
    }

    /** 트랜잭션 롤백 */
    public String rollback(String entity, long historySeq) throws IOException {
        return request("POST", "/v1/entity/" + entity + "/rollback/" + historySeq, null);
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    private String request(String method, String path, String body) throws IOException {
        return request(method, path, body, Collections.emptyMap());
    }

    private String request(String method, String path, String body, Map<String, String> extraHeaders) throws IOException {
        String bodyStr   = body != null ? body : "";
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
        String nonce     = UUID.randomUUID().toString();
        String signature = sign(method, path, timestamp, nonce, bodyStr);

        URL url = new URL(baseUrl + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Content-Type",  "application/json");
        conn.setRequestProperty("X-API-Key",     apiKey);
        conn.setRequestProperty("X-Timestamp",   timestamp);
        conn.setRequestProperty("X-Nonce",       nonce);
        conn.setRequestProperty("X-Signature",   signature);
        for (Map.Entry<String, String> h : extraHeaders.entrySet()) {
            conn.setRequestProperty(h.getKey(), h.getValue());
        }

        if (!bodyStr.isEmpty()) {
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyStr.getBytes(StandardCharsets.UTF_8));
            }
        }

        int    status      = conn.getResponseCode();
        String contentType = conn.getContentType();
        InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] rawBytes    = readAllBytes(stream);

        // 패킷 암호화 응답: application/octet-stream → 복호화
        String response;
        if (contentType != null && contentType.contains("application/octet-stream")) {
            try {
                response = decryptPacket(rawBytes);
            } catch (Exception e) {
                throw new IOException("Packet decryption failed: " + e.getMessage(), e);
            }
        } else {
            response = new String(rawBytes, StandardCharsets.UTF_8);
        }

        if (status >= 400) {
            throw new IOException("EntityServer error (HTTP " + status + "): " + response);
        }
        return response;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     *
     * Bouncy Castle ChaCha20Poly1305 사용 (nonce 24바이트 → 자동으로 XChaCha20 선택)
     */
    private String decryptPacket(byte[] data) throws Exception {
        byte[] key    = sha256(hmacSecret.getBytes(StandardCharsets.UTF_8));
        byte[] nonce  = Arrays.copyOfRange(data, magicLen, magicLen + 24);
        byte[] ctext  = Arrays.copyOfRange(data, magicLen + 24, data.length);

        ChaCha20Poly1305 aead = new ChaCha20Poly1305();
        aead.init(false, new AEADParameters(new KeyParameter(key), 128, nonce));

        byte[] plaintext = new byte[aead.getOutputSize(ctext.length)];
        int    len       = aead.processBytes(ctext, 0, ctext.length, plaintext, 0);
        aead.doFinal(plaintext, len);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    /** HMAC-SHA256 서명 */
    private String sign(String method, String path, String timestamp, String nonce, String body) {
        try {
            String payload = String.join("|", method, path, timestamp, nonce, body);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash); // Java 17+
        } catch (Exception e) {
            throw new RuntimeException("HMAC signing failed", e);
        }
    }

    private static byte[] sha256(byte[] input) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(input);
    }

    private static byte[] readAllBytes(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
        return buf.toByteArray();
    }

    private static String getEnv(String key, String defaultValue) {
        String v = System.getenv(key);
        return (v != null && !v.isBlank()) ? v : defaultValue;
    }
}
