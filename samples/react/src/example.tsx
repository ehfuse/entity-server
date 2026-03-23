/**
 * React 컴포넌트 사용 예제
 *
 * 설정:
 *   1. .env 에 VITE_ENTITY_SERVER_URL=http://localhost:47200 추가
 *   2. 로그인 시 entityServer.login(email, password) 호출
 *   3. 이후 client 메서드로 데이터 조회/수정
 */

// @ts-ignore
import { useEffect, useState } from "react";
// @ts-ignore
import { useEntityServer } from "entity-server-client/react";
// @ts-ignore
import type { EntityListResult } from "entity-server-client";

interface Product {
    seq: number;
    name: string;
    price: number;
    category: string;
}

// ─── 목록 컴포넌트 ─────────────────────────────────────────────────────────

export function ProductList() {
    const { client, isPending, error, del } = useEntityServer();
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<EntityListResult<Product> | null>(
        null,
    );
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        client
            .list<Product>("product", { page, limit: 20 })
            .then((r) => setResult(r.data))
            .finally(() => setLoading(false));
    }, [client, page]);

    if (loading) return <p>로딩 중...</p>;
    if (error) return <p>에러: {error.message}</p>;

    return (
        <div>
            <h2>상품 목록 ({result?.total ?? 0}건)</h2>
            <ul>
                {result?.items.map((item) => (
                    <li key={item.seq}>
                        [{item.seq}] {item.name} — {item.price.toLocaleString()}
                        원
                        <button
                            onClick={() => del("product", item.seq)}
                            disabled={isPending}
                        >
                            삭제
                        </button>
                    </li>
                ))}
            </ul>
            <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
            >
                이전
            </button>
            <span> {page} </span>
            <button onClick={() => setPage((p) => p + 1)}>다음</button>
        </div>
    );
}

// ─── 단건 조회 컴포넌트 ─────────────────────────────────────────────────────

export function ProductDetail({ seq }: { seq: number }) {
    const { client } = useEntityServer();
    const [item, setItem] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        client
            .get<Product>("product", seq)
            .then((r) => setItem(r.data))
            .catch(() => setItem(null))
            .finally(() => setLoading(false));
    }, [client, seq]);

    if (loading) return <p>로딩 중...</p>;
    if (!item) return <p>상품을 찾을 수 없습니다.</p>;

    return (
        <div>
            <h3>{item.name}</h3>
            <p>가격: {item.price.toLocaleString()}원</p>
            <p>카테고리: {item.category}</p>
        </div>
    );
}

// ─── 생성/수정 폼 컴포넌트 ──────────────────────────────────────────────────

export function ProductForm({ seq }: { seq?: number }) {
    const { submit, isPending } = useEntityServer();
    const [form, setForm] = useState({ name: "", price: 0, category: "" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // seq 있으면 수정, 없으면 생성
        await submit("product", seq ? { ...form, seq } : form);
        alert(seq ? "수정 완료" : "등록 완료");
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                placeholder="상품명"
                value={form.name}
                onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                }
            />
            <input
                type="number"
                placeholder="가격"
                value={form.price}
                onChange={(e) =>
                    setForm((f) => ({ ...f, price: +e.target.value }))
                }
            />
            <input
                placeholder="카테고리"
                value={form.category}
                onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                }
            />
            <button type="submit" disabled={isPending}>
                {seq ? "수정" : "등록"}
            </button>
        </form>
    );
}
