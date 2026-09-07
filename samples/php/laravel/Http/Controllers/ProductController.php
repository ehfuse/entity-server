<?php

namespace App\Http\Controllers;

use App\Services\EntityServerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * EntityServerService를 사용하는 Laravel 컨트롤러 예시
 */
class ProductController extends Controller
{
    public function __construct(private EntityServerService $es) {}

    /** GET /api/products */
    public function index(Request $request): JsonResponse
    {
        $result = $this->es->list('product', [
            'page'  => $request->integer('page', 1),
            'limit' => $request->integer('limit', 20),
        ]);
        return response()->json($result);
    }

    /** GET /api/products/{seq} */
    public function show(int $seq): JsonResponse
    {
        return response()->json($this->es->get('product', $seq));
    }

    /** POST /api/products/search */
    public function search(Request $request): JsonResponse
    {
        $result = $this->es->query(
            'product',
            $request->input('filter', []),
            ['page' => $request->integer('page', 1), 'limit' => $request->integer('limit', 20)]
        );
        return response()->json($result);
    }

    /** POST /api/products */
    public function store(Request $request): JsonResponse
    {
        $result = $this->es->submit('product', $request->all());
        return response()->json($result, 201);
    }

    /** PUT /api/products/{seq} */
    public function update(Request $request, int $seq): JsonResponse
    {
        $result = $this->es->submit('product', array_merge($request->all(), ['seq' => $seq]));
        return response()->json($result);
    }

    /** DELETE /api/products/{seq} */
    public function destroy(int $seq): JsonResponse
    {
        return response()->json($this->es->delete('product', $seq));
    }
}
