<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Entity Server 클라이언트 서비스 (Laravel)
 *
 * 필요 확장: ext-sodium (PHP 7.2+ 기본 내장) — XChaCha20-Poly1305 복호화
 *
 * 설정: config/services.php 또는 .env
 *   ENTITY_SERVER_URL=http://localhost:47200
 *   ENTITY_SERVER_API_KEY=your-api-key
 *   ENTITY_SERVER_HMAC_SECRET=your-hmac-secret
 *   ENTITY_PACKET_MAGIC_LEN=4
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
    private int     $magicLen;
    private ?string $activeTxId = null;

    public function __construct()
    {
        $this->baseUrl    = rtrim(config('services.entity_server.url',         env('ENTITY_SERVER_URL',         'http://localhost:47200')), '/');
        $this->apiKey     = config('services.entity_server.api_key',     env('ENTITY_SERVER_API_KEY',     ''));
        $this->hmacSecret = config('services.entity_server.hmac_secret', env('ENTITY_SERVER_HMAC_SECRET', ''));
        $this->magicLen   = (int) config('services.entity_server.packet_magic_len', env('ENTITY_PACKET_MAGIC_LEN', 4));
    }

    // ─── CRUD ────────────────────────────────────────────────────────────────

    public function get(string $entity, int $seq): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/{$seq}");
    }

    public function list(string $entity, array $params = []): array
    {
        $query = http_build_query(array_merge(['page' => 1, 'limit' => 20], $params));
        return $this->request('GET', "/v1/entity/{$entity}/list?{$query}");
    }

    public function count(string $entity): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/count");
    }

    public function query(string $entity, array $filter = [], array $params = []): array
    {
        $query = http_build_query(array_merge(['page' => 1, 'limit' => 20], $params));
        return $this->request('POST', "/v1/entity/{$entity}/query?{$query}", $filter);
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
    public function submit(string $entity, array $data, ?string $transactionId = null): array
    {
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID' => $txId] : [];
        return $this->request('POST', "/v1/entity/{$entity}/submit", $data, $extra);
    }

    /** 삭제 */
    public function delete(string $entity, int $seq, ?string $transactionId = null, bool $hard = false): array
    {
        $q     = $hard ? '?hard=true' : '';
        $txId  = $transactionId ?? $this->activeTxId;
        $extra = $txId ? ['X-Transaction-ID' => $txId] : [];
        return $this->request('DELETE', "/v1/entity/{$entity}/delete/{$seq}{$q}", [], $extra);
    }

    public function history(string $entity, int $seq, int $page = 1, int $limit = 50): array
    {
        return $this->request('GET', "/v1/entity/{$entity}/history/{$seq}?page={$page}&limit={$limit}");
    }

    public function rollback(string $entity, int $historySeq): array
    {
        return $this->request('POST', "/v1/entity/{$entity}/rollback/{$historySeq}");
    }

    // ─── 내부 ─────────────────────────────────────────────────────────────────

    private function request(string $method, string $path, array $body = [], array $extraHeaders = []): array
    {
        $bodyJson  = empty($body) ? '' : json_encode($body, JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        $nonce     = (string) Str::uuid();
        $signature = $this->sign($method, $path, $timestamp, $nonce, $bodyJson);

        $http = Http::withHeaders(array_merge([
            'X-API-Key'   => $this->apiKey,
            'X-Timestamp' => $timestamp,
            'X-Nonce'     => $nonce,
            'X-Signature' => $signature,
        ], $extraHeaders))->timeout(10);

        $response = match ($method) {
            'GET'    => $http->get($this->baseUrl . $path),
            'POST'   => $http->withBody($bodyJson, 'application/json')->post($this->baseUrl . $path),
            'DELETE' => $http->delete($this->baseUrl . $path),
            default  => throw new \InvalidArgumentException("Unsupported method: {$method}"),
        };

        $decoded = $response->json();

        // 패킷 암호화 응답: application/octet-stream → 복호화
        $contentType = $response->header('Content-Type') ?? '';
        if (str_contains($contentType, 'application/octet-stream')) {
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
     * XChaCha20-Poly1305 패킷 복호화
     * 포맷: [magic:magicLen][nonce:24][ciphertext+tag]
     * 키: sha256(hmac_secret)
     *
     * ext-sodium 사용 (PHP 7.2+ 내장)
     */
    private function decryptPacket(string $data): string
    {
        $key        = hash('sha256', $this->hmacSecret, true);
        $nonce      = substr($data, $this->magicLen, 24);
        $ciphertext = substr($data, $this->magicLen + 24);

        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt($ciphertext, '', $nonce, $key);
        if ($plaintext === false) {
            throw new \RuntimeException('Packet decryption failed: authentication tag mismatch');
        }
        return $plaintext;
    }

    private function sign(string $method, string $path, string $timestamp, string $nonce, string $body): string
    {
        $payload = implode('|', [$method, $path, $timestamp, $nonce, $body]);
        return hash_hmac('sha256', $payload, $this->hmacSecret);
    }
}
