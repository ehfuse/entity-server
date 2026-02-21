<?php

namespace App\Controllers;

use App\Controllers\BaseController;
use App\Libraries\EntityServer;

/**
 * EntityServer 라이브러리를 사용하는 CI4 컨트롤러 예시
 */
class ProductController extends BaseController
{
    private EntityServer $es;

    public function __construct()
    {
        $this->es = new EntityServer();
    }

    /** GET /products */
    public function index(): string
    {
        $page   = (int) ($this->request->getGet('page')  ?? 1);
        $limit  = (int) ($this->request->getGet('limit') ?? 20);
        $result = $this->es->list('product', ['page' => $page, 'limit' => $limit]);

        return $this->response->setJSON($result)->getBody();
    }

    /** GET /products/(:num) */
    public function show(int $seq): string
    {
        $result = $this->es->get('product', $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /** POST /products/search */
    public function search(): string
    {
        $body   = $this->request->getJSON(true);
        $filter = $body['filter'] ?? [];
        $params = ['page' => $body['page'] ?? 1, 'limit' => $body['limit'] ?? 20];

        // 필터 예: [['field' => 'category', 'op' => 'eq', 'value' => 'electronics']]
        $result = $this->es->query('product', $filter, $params);
        return $this->response->setJSON($result)->getBody();
    }

    /** POST /products */
    public function create(): string
    {
        $data   = $this->request->getJSON(true);
        // seq 없이 submit → 생성
        $result = $this->es->submit('product', $data);
        return $this->response->setStatusCode(201)->setJSON($result)->getBody();
    }

    /** PUT /products/(:num) */
    public function update(int $seq): string
    {
        $data        = $this->request->getJSON(true);
        $data['seq'] = $seq; // seq 포함 → 수정
        $result      = $this->es->submit('product', $data);
        return $this->response->setJSON($result)->getBody();
    }

    /** DELETE /products/(:num) */
    public function delete(int $seq): string
    {
        $result = $this->es->delete('product', $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /** GET /products/(:num)/history */
    public function history(int $seq): string
    {
        $result = $this->es->history('product', $seq);
        return $this->response->setJSON($result)->getBody();
    }

    /**
     * POST /products/order
     *
     * 트랜잭션 예시: 상품 재고 차감 + 주문 생성을 하나의 DB 트랜잭션으로 처리.
     * submit 요청은 서버 큐에 쌓이고 transCommit() 시 단일 DB 트랜잭션으로 일괄 커밋됩니다.
     * 실패 시 transRollback() 으로 큐를 버립니다.
     *
     * 요청 body 예:
     *   { "product_seq": 5, "qty": 2, "buyer": "홍길동" }
     */
    public function order(): string
    {
        $body        = $this->request->getJSON(true);
        $productSeq  = (int) ($body['product_seq'] ?? 0);
        $qty         = (int) ($body['qty']         ?? 1);
        $buyer       = $body['buyer'] ?? '';

        if (!$productSeq) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => 'product_seq required'])
                ->getBody();
        }

        $this->es->transStart(); // 서버 큐 등록, 이후 submit / delete 시 큐에씀임

        try {
            // 1) 상품 조회 후 재고 차감
            $product = $this->es->get('product', $productSeq);
            $stock   = (int) ($product['data']['stock'] ?? 0);
            if ($stock < $qty) {
                throw new \RuntimeException('재고 부족');
            }
            $this->es->submit('product', [
                'seq'   => $productSeq,
                'stock' => $stock - $qty,
            ]);

            // 2) 주문 생성
            $this->es->submit('order', [
                'product_seq' => $productSeq,
                'qty'         => $qty,
                'buyer'       => $buyer,
                'status'      => 'pending',
            ]);

            // 3) 단일 DB 트랜잭션으로 일괄 커밋
            //    results[0] = product update, results[1] = order insert
            $commitResult = $this->es->transCommit();
            $orderSeq = $commitResult['results'][1]['seq'] ?? null;

            return $this->response->setStatusCode(201)
                ->setJSON(['ok' => true, 'order_seq' => $orderSeq])
                ->getBody();
        } catch (\Throwable $e) {
            $this->es->transRollback(); // 큐 버림 (아직 커밋 안 된 경우) 또는 saga 롤백
            return $this->response->setStatusCode(500)
                ->setJSON(['ok' => false, 'message' => $e->getMessage()])
                ->getBody();
        }
    }
}
