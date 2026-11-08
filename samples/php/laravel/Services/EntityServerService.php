<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Http\Request;

/**
 * Entity Server 클라이언트 서비스 (Laravel)
 *
 * 필요 확장: ext-sodium (PHP 7.2+ 기본 내장) — XChaCha20-Poly1305 복호화
 *
 * 설정: config/services.php 또는 .env
 *   ENTITY_SERVER_URL=http://localhost:47200
 *   ENTITY_SERVER_API_KEY=your-api-key
 *   ENTITY_SERVER_HMAC_SECRET=your-hmac-secret
 *
 * 서비스 프로바이더 등록:
 *   $this->app->singleton(EntityServerService::class);
 *
 * 컨트롤러 사용법:
 *   public function __construct(private EntityServerService $es) {}
 *   $result = $this->es->get('account', 1);
 *
 * 트랜잭션 사용 예:
 *   $es->transStart();
 *   try {
 *     $orderRef = $es->submit('order', ['user_seq' => 1, 'total' => 9900]); // seq: "$tx.0"
 *     $es->submit('order_item', ['order_seq' => $orderRef['seq'], 'item_seq' => 5]); // "$tx.0" 자동 치환
 *     $result   = $es->transCommit();
 *     $orderSeq = $result['results'][0]['seq']; // 실제 seq
 *   } catch (\Throwable $e) {
 *     $es->transRollback();
 *   }
 */
class EntityServerService
{
    private string  $baseUrl;
    private string  $apiKey;
    private string  $hmacSecret;
    private string  $token = '';
    private bool    $requireEncryptedRequest;
    private bool    $encryptRequests;
    private bool    $packetEncryption = false;
    private ?string $activeTxId = null;

    public function __construct()
    {
        $this->baseUrl    = rtrim(config('services.entity_server.url',         env('ENTITY_SERVER_URL',         'http://localhost:47200')), '/');
        $this->apiKey     = config('services.entity_server.api_key',     env('ENTITY_SERVER_API_KEY',     ''));
        $this->hmacSecret = config('services.entity_server.hmac_secret', env('ENTITY_SERVER_HMAC_SECRET', ''));
        $this->token      = config('services.entity_server.token',        env('ENTITY_SERVER_TOKEN',        ''));
        $this->requireEncryptedRequest = (bool) config('services.entity_server.require_encrypted_request', env('ENTITY_REQUIRE_ENCRYPTED_REQUEST', true));
        $this->encryptRequests         = (bool) config('services.entity_server.encrypt_requests',          env('ENTITY_ENCRYPT_REQUESTS',          false));
    }

    /** JWT Bearer 토큰을 설정합니다. HMAC 모드와 배타적으로 사용합니다. */
    public function setToken(string $token): void
    {
        $this->token = $token;
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    /**
     * 서버 헬스 체크를 수행하고 패킷 암호화 활성 여부를 자동으로 감지합니다.
     * 서버가 packet_encryption: true 를 응답하면 이후 모든 요청에 암호화가 자동 적용됩니다.
     */
    public function checkHealth(): array
    {
        $response = Http::timeout(10)->get($this->baseUrl . '/v1/health');
        $decoded  = $response->json() ?? [];
        if (!empty($decoded['packet_encryption'])) {
            $this->packetEncryption = true;
        }
        return $decoded;
    }

    /**
     * 단건 조회
     *
     * @param bool $skipHooks true 이면 after_get 훅 미실행
     */
    public function get(string $entity, int $seq, bool $skipHooks = false): array
    {
        $q = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('GET', "/v1/entity/{$entity}/{$seq}{$q}");
    }

    /**
     * 조건으로 단건 조회 (POST + conditions body)
     *
     * @param array $conditions 필터 조건. index/hash/unique 필드만 사용 가능.
     *                          예: ['email' => 'user@example.com']
     * @param bool  $skipHooks  true 이면 after_find 훅 미실행
     */
    public function find(string $entity, array $conditions, bool $skipHooks = false): array
    {
        $q = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('POST', "/v1/entity/{$entity}/find{$q}", $conditions);
    }

    /**
     * 목록 조회 (POST + conditions body)
     *
     * @param array $params     펙이지/정렬 파라미터 (page, limit, orderBy, orderDir, fields)
     * @param array $conditions 필터 조건 POST body. index/hash/unique 필드만 사용 가능.
     *                          fields 예: ['*'] 시 전체 필드 반환, 미지정 시 인덱스 필드만 반환 (기본, 가장 빠름)
     *                          fields 예: ['name','email'] 또는 미지정
     */
    public function list(string $entity, array $params = [], array $conditions = []): array
    {
        $queryParams = array_merge(['page' => 1, 'limit' => 20], $params);

        if (isset($queryParams['orderDir'])) {
            $dir = strtoupper((string) $queryParams['orderDir']);
            $orderBy = (string) ($queryParams['orderBy'] ?? '');
            if ($dir === 'DESC' && $orderBy !== '') {
                $queryParams['orderBy'] = '-' . ltrim($orderBy, '-');
            }
            unset($queryParams['orderDir']);
        }

        if (isset($queryParams['fields']) && is_array($queryParams['fields'])) {
            $queryParams['fields'] = implode(',', $queryParams['fields']);
        }

        $query = http_build_query($queryParams);
        return $this->request('POST', "/v1/entity/{$entity}/list?{$query}", $conditions);
    }

    /**
     * 건수 조회
     *
     * @param array $conditions 필터 조건 (list() 와 동일 규칙)
     */
    public function count(string $entity, array $conditions = []): array
    {
        return $this->request('POST', "/v1/entity/{$entity}/count", $conditions);
    }

    /**
     * 커스텀 SQL 조회 (SELECT 전용, 인덱스 테이블만, JOIN 지원)
     *
     * - SELECT 쿼리만 허용 (INSERT/UPDATE/DELETE 불가)
     * - SELECT * 불가. 최대 반환 건수 1000
     * - 사용자 입력은 반드시 $params 로 바인딩 (SQL Injection 방지)
     *
     * @param string   $entity  URL 라우트용 기본 엔티티명
     * @param string   $sql     SELECT SQL
     * @param array    $params  ? 플레이스홀더 바인딩 값
     * @param int|null $limit   최대 반환 건수 (최대 1000)
     */
    public function query(string $entity, string $sql, array $params = [], ?int $limit = null): array
    {
        $body = ['sql' => $sql, 'params' => $params];
        if ($limit !== null) {
            $body['limit'] = $limit;
        }
        return $this->request('POST', "/v1/entity/{$entity}/query", $body);
    }

    /**
     * 트랜잭션 시작 — 서버에 큐를 등록하고 txId 를 저장합니다.
     * 이후 submit / delete 가 실제 실행되지 않고 서버 큐에 쌓입니다.
     * transCommit() 시 한 번에 DB 트랜잭션으로 실행됩니다.
     */
    public function transStart(): string
    {
        $result = $this->request('POST', '/v1/transaction/start');
        $this->activeTxId = $result['transaction_id'];
        return $this->activeTxId;
    }

    /**
     * 트랜잭션 전체 롤백
     * $transactionId 생략 시 transStart() 로 시작한 활성 트랜잭션을 롤백합니다.
     */
    public function transRollback(?string $transactionId = null): array
    {
        $txId = $transactionId ?? $this->activeTxId;
        if ($txId === null) {
            throw new \RuntimeException('No active transaction. Call transStart() first.');
        }
        $this->activeTxId = null;
        return $this->request('POST', "/v1/transaction/rollback/{$txId}");
    }

    /** 트랜잭션 커밋 — 큐에 쌓인 모든 작업을 단일 DB 트랜잭션으로 일괄 실행합니다. */
    public function transCommit(): array
    {
        $txId = $this->activeTxId;
        if ($txId === null) {
            throw new \RuntimeException('No active transaction. Call transStart() first.');
        }
        $this->activeTxId = null;
        return $this->request('POST', "/v1/transaction/commit/{$txId}");
    }

    /** 생성 또는 수정 (seq 포함시 수정, 없으면 생성) */
    public function submit(string $entity, array $data, ?string $transactionId = null, bool $skipHooks = false): array
    {
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID' => $txId] : [];
        $q     = $skipHooks ? '?skipHooks=true' : '';
        return $this->request('POST', "/v1/entity/{$entity}/submit{$q}", $data, $extra);
    }

    /**
     * 삭제 (서버는 POST /delete/:seq 로만 처리)
     *
     * @param bool        $hard          true 이면 하드(물리) 삭제. false(기본) 소프트 삭제 (rollback 복원 가능)
     * @param string|null $transactionId transStart() 로 얻은 ID (생략 시 활성 트랜잭션 자동)
     * @param bool        $skipHooks     true 이면 before/after_delete 훅 미실행
     */
    public function delete(string $entity, int $seq, ?string $transactionId = null, bool $hard = false, bool $skipHooks = false): array
    {
        $queryParams = [];
        if ($hard) {
            $queryParams[] = 'hard=true';
        }
        if ($skipHooks) {
            $queryParams[] = 'skipHooks=true';
        }
        $q     = $queryParams ? '?' . implode('&', $queryParams) : '';
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID' => $txId] : [];
        return $this->request('POST', "/v1/entity/{$entity}/delete/{$seq}{$q}", [], $extra);
    }

    public function history(string $entity, int $seq, int $page = 1, int $limit = 50): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/history/{$seq}?page={$page}&limit={$limit}");
    }

    public function rollback(string $entity, int $historySeq): array
    {
        return $this->request('POST', "/v1/entity/{$entity}/rollback/{$historySeq}");
    }

    /**
     * 푸시 발송 트리거 엔티티에 submit합니다.
     */
    public function push(string $pushEntity, array $payload, ?string $transactionId = null): array
    {
        return $this->submit($pushEntity, $payload, $transactionId);
    }

    /**
     * push_log 목록 조회 헬퍼
     */
    public function pushLogList(array $params = []): array
    {
        return $this->list('push_log', $params);
    }

    /**
     * Laravel Request에서 암호화 패킷 또는 평문 JSON 본문을 읽어 배열로 반환합니다.
     */
    public function readRequestBody(Request $request, ?bool $requireEncrypted = null): array
    {
        $requireEncrypted = $requireEncrypted ?? $this->requireEncryptedRequest;

        $contentType = strtolower((string) $request->header('Content-Type', ''));
        $rawBody = (string) $request->getContent();
        $isEncrypted = str_contains($contentType, 'application/octet-stream');

        if ($requireEncrypted && !$isEncrypted) {
            throw new \RuntimeException('Encrypted request required: Content-Type must be application/octet-stream');
        }

        if ($isEncrypted) {
            if ($rawBody === '') {
                throw new \RuntimeException('Encrypted request body is empty');
            }
            $jsonStr = $this->decryptPacket($rawBody);
            $decoded = json_decode($jsonStr, true);
            if (!is_array($decoded)) {
                throw new \RuntimeException('Invalid encrypted JSON payload');
            }
            return $decoded;
        }

        if ($rawBody === '') {
            return [];
        }
        $decoded = json_decode($rawBody, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Invalid JSON payload');
        }
        return $decoded;
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    private function request(string $method, string $path, array $body = [], array $extraHeaders = []): array
    {
        // 요청 바디 결정: encryptRequests 시 POST 바디를 암호화
        $bodyJson    = empty($body) ? '' : json_encode($body, JSON_UNESCAPED_UNICODE);
        $bodyData    = $bodyJson;
        $contentType = 'application/json';

        if (($this->encryptRequests || $this->packetEncryption) && $bodyJson !== '') {
            $bodyData    = $this->encryptPacket($bodyJson);
            $contentType = 'application/octet-stream';
        }

        $isHmacMode = $this->apiKey !== '' && $this->hmacSecret !== '';

        $http = Http::timeout(10);
        if ($isHmacMode) {
            $timestamp = (string) time();
            $nonce     = (string) Str::uuid();
            $signature = $this->sign($method, $path, $timestamp, $nonce, $bodyData);
            $http = $http->withHeaders(array_merge([
                'X-API-Key'   => $this->apiKey,
                'X-Timestamp' => $timestamp,
                'X-Nonce'     => $nonce,
                'X-Signature' => $signature,
            ], $extraHeaders));
        } else {
            $authHeaders = $this->token !== '' ? ['Authorization' => 'Bearer ' . $this->token] : [];
            $http = $http->withHeaders(array_merge($authHeaders, $extraHeaders));
        }

        $response = match ($method) {
            'GET'    => $http->get($this->baseUrl . $path),
            'POST'   => $http->withBody($bodyData, $contentType)->post($this->baseUrl . $path),
            'DELETE' => $http->delete($this->baseUrl . $path),
            default  => throw new \InvalidArgumentException("Unsupported method: {$method}"),
        };

        // 패킷 암호화 응답: application/octet-stream → 복호화
        $respContentType = $response->header('Content-Type') ?? '';
        if (str_contains($respContentType, 'application/octet-stream')) {
            $jsonStr = $this->decryptPacket($response->body());
            $decoded = json_decode($jsonStr, true);
        } else {
            $decoded = $response->json();
        }

        if (!($decoded['ok'] ?? false)) {
            throw new \RuntimeException(
                'EntityServer error: ' . ($decoded['message'] ?? 'Unknown') .
                    ' (HTTP ' . $response->status() . ')'
            );
        }

        return $decoded;
    }

    /**
     * 패킷 암호화 키를 유도합니다.
     * - HMAC 모드: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     * - JWT  모드: SHA256(token)
     */
    private function derivePacketKey(): string
    {
        if ($this->token !== '' && $this->hmacSecret === '') {
            return hash('sha256', $this->token, true);
        }
        $salt = 'entity-server:hkdf:v1';
        $info = 'entity-server:packet-encryption';
        // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
        $prk  = hash_hmac('sha256', $this->hmacSecret, $salt, true);
        // HKDF-Expand(PRK, info, 32): T(1) = HMAC-SHA256(PRK, info || 0x01)
        return substr(hash_hmac('sha256', $info . chr(1), $prk, true), 0, 32);
    }

    /**
     * XChaCha20-Poly1305 패킷 암호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     */
    private function encryptPacket(string $plaintext): string
    {
        $key   = $this->derivePacketKey();
        $magicLen = 2 + (ord($key[31]) % 14);
        $magic = random_bytes($magicLen);
        $nonce = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES); // 24
        $ct    = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plaintext, '', $nonce, $key);
        return $magic . $nonce . $ct;
    }

    /**
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: HKDF-SHA256(hmac_secret, "entity-server:packet-encryption")
     *
     * ext-sodium 사용 (PHP 7.2+ 내장)
     */
    private function decryptPacket(string $data): string
    {
        $key        = $this->derivePacketKey();
        $magicLen   = 2 + (ord($key[31]) % 14);
        $nonce      = substr($data, $magicLen, 24);
        $ciphertext = substr($data, $magicLen + 24);

        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt($ciphertext, '', $nonce, $key);
        if ($plaintext === false) {
            throw new \RuntimeException('Packet decryption failed: authentication tag mismatch');
        }
        return $plaintext;
    }

    /**
     * HMAC-SHA256 서명. $body 는 JSON 스트링 또는 바이너리 암호화 페이로드 모두 지원합니다.
     * prefix = "METHOD|path|timestamp|nonce|" 뒤에 $body 를 바로 이어 붙여 서명합니다.
     */
    private function sign(string $method, string $path, string $timestamp, string $nonce, string $body): string
    {
        $prefix = implode('|', [$method, $path, $timestamp, $nonce]) . '|';
        return hash_hmac('sha256', $prefix . $body, $this->hmacSecret);
    }
}
