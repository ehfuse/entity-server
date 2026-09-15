<?php

namespace App\Controllers;

/**
 * Product 전용 컨트롤러 예시.
 * 기본 CRUD는 EntityController를 상속받아 그대로 사용하고,
 * 확장 기능(order)만 이 컨트롤러에서 구현합니다.
 */
class ProductController extends EntityController
{
    protected string $entity = 'product';

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
        try {
            $body = $this->es->readRequestBody($this->request);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => $e->getMessage()])
                ->getBody();
        }

        $productSeq  = (int) ($body['product_seq'] ?? 0);
        $qty         = (int) ($body['qty']         ?? 1);
        $buyer       = $body['buyer'] ?? '';

        if (!$productSeq) {
            return $this->response->setStatusCode(400)
                ->setJSON(['ok' => false, 'message' => 'product_seq required'])
                ->getBody();
        }

        $this->es->transStart(); // 서버 큐 등록, 이후 submit / delete 는 큐에 적재

        try {
            // 1) 상품 조회 후 재고 차감
            $product = $this->es->get($this->entity, $productSeq);
            $stock   = (int) ($product['data']['stock'] ?? 0);
            if ($stock < $qty) {
                throw new \RuntimeException('재고 부족');
            }
            $this->es->submit($this->entity, [
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
