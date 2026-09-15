<?php

namespace App\Controllers;

use App\Controllers\BaseController;
use App\Libraries\EntityServer;

/**
 * EntityServer CRUD를 CI4 컨트롤러에서 공통으로 사용하는 베이스 컨트롤러.
 *
 * 사용법:
 *  class ProductController extends EntityController {
 *      protected string $entity = 'product';
 *  }
 */
abstract class EntityController extends BaseController
{
    protected EntityServer $es;

    /** 대상 엔티티명 (하위 컨트롤러에서 지정) */
    protected string $entity = '';

    /**
     * 푸시 트리거용 엔티티명 (기본: 시스템 엔티티 push_msg)
     *
     * 주의: push 인프라 필수 엔티티는 account_device / push_msg / push_log 이며,
     * 이 값은 "어떤 엔티티 insert로 push hook를 트리거할지"를 결정합니다.
     */
    protected string $pushEntity = 'push_msg';

    /** pushEntity에서 수신자를 가리키는 필드명 */
    protected string $pushTargetField = 'account_seq';

    public function __construct()
    {
        $this->es = new EntityServer();
    }

    /** GET /{entity}/list?page=1&limit=20 */
    public function list(): string
    {
        $page  = (int) ($this->request->getGet('page') ?? 1);
        $limit = (int) ($this->request->getGet('limit') ?? 20);

        $result = $this->es->list($this->entity, [
            'page'  => $page,
            'limit' => $limit,
        ]);

        return $this->response->setJSON($result)->getBody();
    }

    /** GET /{entity}/get/(:num) */
    public function get(int $seq): string
    {
        $result = $this->es->get($this->entity, $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /** POST /{entity}/query */
    public function query(): string
    {
        try {
            $body = $this->es->readRequestBody($this->request);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => $e->getMessage()])
                ->getBody();
        }

        $filter = $body['filter'] ?? [];
        $params = [
            'page'  => $body['page'] ?? 1,
            'limit' => $body['limit'] ?? 20,
        ];

        $result = $this->es->query($this->entity, $filter, $params);
        return $this->response->setJSON($result)->getBody();
    }

    /**
     * POST /{entity}/submit
     * POST /{entity}/submit/(:num)  (seq route param을 body에 주입)
     */
    public function submit(?int $seq = null): string
    {
        try {
            $data = $this->es->readRequestBody($this->request);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => $e->getMessage()])
                ->getBody();
        }

        if ($seq !== null) {
            $data['seq'] = $seq;
        }

        $result = $this->es->submit($this->entity, $data);
        return $this->response->setJSON($result)->getBody();
    }

    /** DELETE /{entity}/delete/(:num) */
    public function delete(int $seq): string
    {
        $result = $this->es->delete($this->entity, $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /** GET /{entity}/history/(:num) */
    public function history(int $seq): string
    {
        $result = $this->es->history($this->entity, $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /** POST /{entity}/rollback/(:num) */
    public function rollback(int $historySeq): string
    {
        $result = $this->es->rollback($this->entity, $historySeq);
        return $this->response->setJSON($result)->getBody();
    }

    /**
     * POST /{entity}/push
     *
     * push hook가 연결된 엔티티(push_msg 등)에 submit하여 푸시를 발행합니다.
     * 요청 예:
     * {
     *   "account_seq": 1,
     *   "title": "알림 제목",
     *   "message": "알림 본문",
     *   "ref_entity": "order",
     *   "ref_seq": 123,
     *   "data": {"order_seq": "123"}
     * }
     */
    public function push(): string
    {
        try {
            $body = $this->es->readRequestBody($this->request);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => $e->getMessage()])
                ->getBody();
        }

        $target = (int) ($body[$this->pushTargetField] ?? 0);
        if ($target <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON([
                    'ok'      => false,
                    'message' => sprintf('%s required', $this->pushTargetField),
                ])
                ->getBody();
        }

        $title = (string) ($body['title'] ?? '');
        $message = (string) ($body['message'] ?? $body['body'] ?? '');

        $payload = [
            $this->pushTargetField => $target,
            'title'                => $title,
            'message'              => $message,
        ];

        if (isset($body['ref_entity'])) {
            $payload['ref_entity'] = (string) $body['ref_entity'];
        }
        if (isset($body['ref_seq'])) {
            $payload['ref_seq'] = (int) $body['ref_seq'];
        }
        if (isset($body['data']) && is_array($body['data'])) {
            $payload['data'] = $body['data'];
        }

        $result = $this->es->push($this->pushEntity, $payload);
        return $this->response->setJSON($result)->getBody();
    }

    /**
     * GET /{entity}/push-log/list?page=1&limit=20&account_seq=1
     */
    public function pushLogList(): string
    {
        $page  = (int) ($this->request->getGet('page') ?? 1);
        $limit = (int) ($this->request->getGet('limit') ?? 20);

        $params = [
            'page'  => $page,
            'limit' => $limit,
        ];

        $accountSeq = (int) ($this->request->getGet('account_seq') ?? 0);
        if ($accountSeq > 0) {
            $params['account_seq'] = $accountSeq;
        }

        $result = $this->es->pushLogList($params);
        return $this->response->setJSON($result)->getBody();
    }
}
