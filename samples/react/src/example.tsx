/**
 * React 컴포넌트 사용 예제
 *
 * 설정:
 *   1. .env 에 VITE_ENTITY_SERVER_URL=http://localhost:47200 추가
 *   2. 로그인 시 entityServer.login(email, password) 호출
 *   3. 이후 훅으로 데이터 조회/수정
 */

import { useState } from "react";
import {
    useEntityDelete,
    useEntityGet,
    useEntityList,
    useEntitySubmit,
} from "./hooks/useEntity";

interface Product {
    seq: number;
    name: string;
    price: number;
    category: string;
}

// ─── 목록 컴포넌트 ─────────────────────────────────────────────────────────

export function ProductList() {
    const [page, setPage] = useState(1);
    const { data, isLoading, error } = useEntityList<Product>("product", {
        page,
        limit: 20,
    });
    const deleteMut = useEntityDelete("product");

    if (isLoading) return <p>로딩 중...</p>;
    if (error) return <p>에러: {(error as Error).message}</p>;

    return (
        <div>
            <h2>상품 목록 ({data?.total ?? 0}건)</h2>
            <ul>
                {data?.data.map((item) => (
                    <li key={item.seq}>
                        [{item.seq}] {item.name} — {item.price.toLocaleString()}
                        원
                        <button
                            onClick={() => deleteMut.mutate(item.seq)}
                            disabled={deleteMut.isPending}
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
    const { data, isLoading } = useEntityGet<Product>("product", seq);

    if (isLoading) return <p>로딩 중...</p>;
    const item = data?.data;
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
    const submitMut = useEntitySubmit("product");
    const [form, setForm] = useState({ name: "", price: 0, category: "" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // seq 있으면 수정, 없으면 생성
        await submitMut.mutateAsync(seq ? { ...form, seq } : form);
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
            <button type="submit" disabled={submitMut.isPending}>
                {seq ? "수정" : "등록"}
            </button>
        </form>
    );
}
