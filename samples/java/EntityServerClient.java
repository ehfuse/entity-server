package com.example.entityserver;

import org.bouncycastle.crypto.generators.HKDFBytesGenerator;
import org.bouncycastle.crypto.modes.ChaCha20Poly1305;
import org.bouncycastle.crypto.params.AEADParameters;
import org.bouncycastle.crypto.params.HKDFParameters;
import org.bouncycastle.crypto.params.KeyParameter;
import org.bouncycastle.crypto.digests.SHA256Digest;

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
import java.security.SecureRandom;
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
 *   ENTITY_SERVER_API_KEY     your-api-key        (HMAC 모드)
 *   ENTITY_SERVER_HMAC_SECRET your-hmac-secret    (HMAC 모드)
 *   ENTITY_SERVER_TOKEN       your-jwt-token      (JWT 모드)
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

    private final String  baseUrl;
    private final String  apiKey;
    private final String  hmacSecret;
    private final int     timeoutMs;
    /** true 이면 POST 요청 바디를 XChaCha20-Poly1305로 암호화합니다. */
    private boolean encryptRequests;
    private boolean packetEncryption = false;
    private String  token = "";
    private         String  activeTxId = null;

    public EntityServerClient() {
        this(
            getEnv("ENTITY_SERVER_URL",         "http://localhost:47200"),
            getEnv("ENTITY_SERVER_API_KEY",     ""),
            getEnv("ENTITY_SERVER_HMAC_SECRET", ""),
            10_000,
            false
        );
        this.token = getEnv("ENTITY_SERVER_TOKEN", "");
    }

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    public void setToken(String token) { this.token = token; }

    public EntityServerClient(String baseUrl, String apiKey, String hmacSecret, int timeoutMs) {
        this(baseUrl, apiKey, hmacSecret, timeoutMs, false);
    }

    public EntityServerClient(String baseUrl, String apiKey, String hmacSecret, int timeoutMs, boolean encryptRequests) {
        this.baseUrl         = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey          = apiKey;
        this.hmacSecret      = hmacSecret;
        this.timeoutMs       = timeoutMs;
        this.encryptRequests = encryptRequests;
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────
    /**
     * 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
     * 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
     * @return JSON 문자열 (예: {"ok":true} 또는 {"ok":true,"packet_encryption":true})
     */
    public String checkHealth() throws IOException {
        String json = request("GET", "/v1/health", null);
        if (json != null && json.contains("\"packet_encryption\":true")) {
            packetEncryption = true;
        }
        return json;
    }
    /** 단건 조회 */
    public String get(String entity, long seq) throws IOException {
        return get(entity, seq, false);
    }

    /** 단건 조회 (skipHooks 지원) */
    public String get(String entity, long seq, boolean skipHooks) throws IOException {
        String q = skipHooks ? "?skipHooks=true" : "";
        return request("GET", "/v1/entity/" + entity + "/" + seq + q, null);
    }

    /** 조건으로 단건 조회 — conditions 에 맞는 행 1건 반환, 없으면 404 */
    public String find(String entity, String conditionsJson) throws IOException {
        return find(entity, conditionsJson, false);
    }

    /** 조건으로 단건 조회 (skipHooks 지원) */
    public String find(String entity, String conditionsJson, boolean skipHooks) throws IOException {
        String q = skipHooks ? "?skipHooks=true" : "";
        return request("POST", "/v1/entity/" + entity + "/find" + q,
                conditionsJson != null ? conditionsJson : "{}");
    }

    /**
     * 목록 조회 (POST + conditions body)
     * @param orderBy        정렬 기준 필드명. null 이면 기본 정렬. - 접두사로 내림차순
     * @param conditionsJson 필터 조건 JSON 객체. index/hash/unique 필드만 사용 가능. null 이면 전체
     */
    public String list(String entity, int page, int limit, String orderBy, String conditionsJson) throws IOException {
        String query = "?page=" + page + "&limit=" + limit + (orderBy != null ? "&order_by=" + orderBy : "");
        return request("POST", "/v1/entity/" + entity + "/list" + query, conditionsJson != null ? conditionsJson : "{}");
    }

    /** 목록 조회 (조건 없음) */
    public String list(String entity, int page, int limit, String orderBy) throws IOException {
        return list(entity, page, limit, orderBy, null);
    }

    /** 건수 조회 */
    public String count(String entity) throws IOException {
        return count(entity, null);
    }

    /** 건수 조회 (conditions 지원) */
    public String count(String entity, String conditionsJson) throws IOException {
        return request("POST", "/v1/entity/" + entity + "/count", conditionsJson != null ? conditionsJson : "{}");
    }

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
     *
     * @param sql        SELECT SQL문. 사용자 입력은 반드시 ? 로 바인딩 (SQL Injection 방지)
     * @param paramsJson 바인딩 파라미터 JSON 배열. 예: "[\"pending\"]"  (null 이면 빈 배열)
     * @param limit      최대 반환 건수 (최대 1000. 0 이하이면 서버 기본값 적용)
     */
    public String query(String entity, String sql, String paramsJson, int limit) throws IOException {
        StringBuilder body = new StringBuilder("{\"sql\":").append(jsonString(sql));
        body.append(",\"params\":").append(paramsJson != null ? paramsJson : "[]");
        if (limit > 0) body.append(",\"limit\":").append(limit);
        body.append("}");
        return request("POST", "/v1/entity/" + entity + "/query", body.toString());
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
        return submit(entity, dataJson, null, false);
    }

    /** 생성 또는 수정 (트랜잭션 지원) */
    public String submit(String entity, String dataJson, String transactionId) throws IOException {
        return submit(entity, dataJson, transactionId, false);
    }

    /** 생성 또는 수정 (skipHooks 지원) */
    public String submit(String entity, String dataJson, String transactionId, boolean skipHooks) throws IOException {
        Map<String, String> extra = new HashMap<>();
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId != null) extra.put("X-Transaction-ID", txId);
        String q = skipHooks ? "?skipHooks=true" : "";
        return request("POST", "/v1/entity/" + entity + "/submit" + q, dataJson, extra);
    }

    /** 삭제 */
    public String delete(String entity, long seq) throws IOException {
        return delete(entity, seq, null, false, false);
    }

    /** 삭제 (트랜잭션/하드 삭제 지원) */
    public String delete(String entity, long seq, String transactionId, boolean hard) throws IOException {
        return delete(entity, seq, transactionId, hard, false);
    }

    /** 삭제 (skipHooks 지원). 서버는 POST /delete/:seq 로만 처리합니다. */
    public String delete(String entity, long seq, String transactionId, boolean hard, boolean skipHooks) throws IOException {
        StringBuilder qb = new StringBuilder();
        if (hard)      { qb.append(qb.length() == 0 ? "?" : "&").append("hard=true"); }
        if (skipHooks) { qb.append(qb.length() == 0 ? "?" : "&").append("skipHooks=true"); }
        Map<String, String> extra = new HashMap<>();
        String txId = transactionId != null ? transactionId : activeTxId;
        if (txId != null) extra.put("X-Transaction-ID", txId);
        return request("POST", "/v1/entity/" + entity + "/delete/" + seq + qb.toString(), null, extra);
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

    /** 푸시 발송 트리거 엔티티에 submit합니다. */
    public String push(String pushEntity, String payloadJson) throws IOException {
        return push(pushEntity, payloadJson, null);
    }

    /** 푸시 발송 트리거 엔티티에 submit합니다. (트랜잭션 지원) */
    public String push(String pushEntity, String payloadJson, String transactionId) throws IOException {
        return submit(pushEntity, payloadJson, transactionId);
    }

    /** push_log 목록 조회 헬퍼 */
    public String pushLogList() throws IOException {
        return pushLogList(1, 20, null);
    }

    /** push_log 목록 조회 헬퍼 */
    public String pushLogList(int page, int limit, String orderBy) throws IOException {
        return list("push_log", page, limit, orderBy);
    }

    /** account_device 디바이스 등록/갱신 헬퍼 (push_token 단일 필드) */
    public String registerPushDevice(
        long accountSeq,
        String deviceId,
        String pushToken,
        String platform,
        String deviceType,
        boolean pushEnabled,
        String transactionId
    ) throws IOException {
        StringBuilder payload = new StringBuilder("{");
        payload.append("\"id\":").append(jsonString(deviceId));
        payload.append(",\"account_seq\":").append(accountSeq);
        payload.append(",\"push_token\":").append(jsonString(pushToken));
        payload.append(",\"push_enabled\":").append(pushEnabled);
        if (platform != null && !platform.isBlank()) {
            payload.append(",\"platform\":").append(jsonString(platform));
        }
        if (deviceType != null && !deviceType.isBlank()) {
            payload.append(",\"device_type\":").append(jsonString(deviceType));
        }
        payload.append("}");

        return submit("account_device", payload.toString(), transactionId);
    }

    /** account_device.seq 기준 push_token 갱신 헬퍼 */
    public String updatePushDeviceToken(
        long deviceSeq,
        String pushToken,
        boolean pushEnabled,
        String transactionId
    ) throws IOException {
        String payload = "{" +
            "\"seq\":" + deviceSeq +
            ",\"push_token\":" + jsonString(pushToken) +
            ",\"push_enabled\":" + pushEnabled +
            "}";
        return submit("account_device", payload, transactionId);
    }

    /** account_device.seq 기준 푸시 수신 비활성화 헬퍼 */
    public String disablePushDevice(long deviceSeq, String transactionId) throws IOException {
        String payload = "{" +
            "\"seq\":" + deviceSeq +
            ",\"push_enabled\":false" +
            "}";
        return submit("account_device", payload, transactionId);
    }

    /**
     * 요청 본문을 읽어 JSON 문자열로 반환합니다.
     * - application/octet-stream: 암호 패킷 복호화
     * - 그 외: 평문 JSON 문자열 반환
     */
    public String readRequestBody(byte[] rawBody, String contentType, boolean requireEncrypted) throws IOException {
        String lowered = contentType == null ? "" : contentType.toLowerCase();
        boolean isEncrypted = lowered.contains("application/octet-stream");

        if (requireEncrypted && !isEncrypted) {
            throw new IOException("Encrypted request required: Content-Type must be application/octet-stream");
        }

        if (isEncrypted) {
            if (rawBody == null || rawBody.length == 0) {
                throw new IOException("Encrypted request body is empty");
            }
            try {
                return decryptPacket(rawBody);
            } catch (Exception e) {
                throw new IOException("Packet decryption failed: " + e.getMessage(), e);
            }
        }

        if (rawBody == null || rawBody.length == 0) {
            return "{}";
        }
        return new String(rawBody, StandardCharsets.UTF_8);
    }

    public String readRequestBody(byte[] rawBody, String contentType) throws IOException {
        return readRequestBody(rawBody, contentType, false);
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    private String request(String method, String path, String body) throws IOException {
        return request(method, path, body, Collections.emptyMap());
    }

    private String request(String method, String path, String body, Map<String, String> extraHeaders) throws IOException {
        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화
        byte[] bodyBytes;
        String contentType;
        if ((encryptRequests || packetEncryption) && body != null && !body.isEmpty()) {
            try {
                bodyBytes   = encryptPacket(body.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                throw new IOException("Packet encryption failed: " + e.getMessage(), e);
            }
            contentType = "application/octet-stream";
        } else {
            bodyBytes   = body != null ? body.getBytes(StandardCharsets.UTF_8) : new byte[0];
            contentType = "application/json";
        }

        boolean isHmacMode = !apiKey.isEmpty() && !hmacSecret.isEmpty();

        URL url = new URL(baseUrl + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestProperty("Content-Type", contentType);
        if (isHmacMode) {
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
            String nonce     = UUID.randomUUID().toString();
            String signature = sign(method, path, timestamp, nonce, bodyBytes);
            conn.setRequestProperty("X-API-Key",   apiKey);
            conn.setRequestProperty("X-Timestamp", timestamp);
            conn.setRequestProperty("X-Nonce",     nonce);
            conn.setRequestProperty("X-Signature", signature);
        } else if (token != null && !token.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + token);
        }
        for (Map.Entry<String, String> h : extraHeaders.entrySet()) {
            conn.setRequestProperty(h.getKey(), h.getValue());
        }

        if (bodyBytes.length > 0) {
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
            }
        }

        int    status      = conn.getResponseCode();
        String respCT      = conn.getContentType();
        InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        byte[] rawBytes    = readAllBytes(stream);

        // 패킷 암호화 응답: application/octet-stream → 복호화
        String response;
        if (respCT != null && respCT.contains("application/octet-stream")) {
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
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    private byte[] derivePacketKey() {
        if (token != null && !token.isEmpty() && hmacSecret.isEmpty()) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                return digest.digest(token.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                throw new RuntimeException("SHA-256 failed", e);
            }
        }
        HKDFBytesGenerator gen = new HKDFBytesGenerator(new SHA256Digest());
        gen.init(new HKDFParameters(
            hmacSecret.getBytes(StandardCharsets.UTF_8),
            "entity-server:hkdf:v1".getBytes(StandardCharsets.UTF_8),
            "entity-server:packet-encryption".getBytes(StandardCharsets.UTF_8)
        ));
        byte[] key = new byte[32];
        gen.generateBytes(key, 0, 32);
        return key;
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * magicLen: 2 + (key[31] & 0xFF) % 14
     */
    private byte[] encryptPacket(byte[] plaintext) throws Exception {
        byte[] key   = derivePacketKey();
        int    magicLen = 2 + (key[31] & 0xFF) % 14;
        byte[] magic = new byte[magicLen];
        byte[] nonce = new byte[24];
        SecureRandom rng = new SecureRandom();
        rng.nextBytes(magic);
        rng.nextBytes(nonce);

        ChaCha20Poly1305 aead = new ChaCha20Poly1305();
        aead.init(true, new AEADParameters(new KeyParameter(key), 128, nonce));
        byte[] ciphertext = new byte[aead.getOutputSize(plaintext.length)];
        int len = aead.processBytes(plaintext, 0, plaintext.length, ciphertext, 0);
        aead.doFinal(ciphertext, len);

        byte[] result = new byte[magic.length + nonce.length + ciphertext.length];
        System.arraycopy(magic,      0, result, 0,                         magic.length);
        System.arraycopy(nonce,      0, result, magic.length,              nonce.length);
        System.arraycopy(ciphertext, 0, result, magic.length + nonce.length, ciphertext.length);
        return result;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     */
    private String decryptPacket(byte[] data) throws Exception {
        byte[] key   = derivePacketKey();
        int    magicLen = 2 + (key[31] & 0xFF) % 14;
        byte[] nonce = Arrays.copyOfRange(data, magicLen, magicLen + 24);
        byte[] ctext = Arrays.copyOfRange(data, magicLen + 24, data.length);

        ChaCha20Poly1305 aead = new ChaCha20Poly1305();
        aead.init(false, new AEADParameters(new KeyParameter(key), 128, nonce));

        byte[] plaintext = new byte[aead.getOutputSize(ctext.length)];
        int    len       = aead.processBytes(ctext, 0, ctext.length, plaintext, 0);
        aead.doFinal(plaintext, len);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    /**
     * HMAC-SHA256 서명. bodyBytes 는 JSON 또는 암호화된 바이너리 모두 지원합니다.
     */
    private String sign(String method, String path, String timestamp, String nonce, byte[] bodyBytes) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String prefix = method + "|" + path + "|" + timestamp + "|" + nonce + "|";
            mac.update(prefix.getBytes(StandardCharsets.UTF_8));
            if (bodyBytes != null && bodyBytes.length > 0) mac.update(bodyBytes);
            byte[] hash = mac.doFinal();
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("HMAC signing failed", e);
        }
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

    private static String jsonString(String value) {
        if (value == null) {
            return "null";
        }
        String escaped = value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
        return "\"" + escaped + "\"";
    }
}
