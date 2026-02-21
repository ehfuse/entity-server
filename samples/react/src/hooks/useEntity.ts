/**
 * Entity Server React 훅
 *
 * @tanstack/react-query 기반
 * 설치: npm install @tanstack/react-query
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    EntityListParams,
    EntityQueryFilter,
} from "../api/entityServerClient";
import { entityServer } from "../api/entityServerClient";

// ─── 조회 훅 ─────────────────────────────────────────────────────────────────

/** 단건 조회 */
export function useEntityGet<T = unknown>(entity: string, seq: number | null) {
    return useQuery({
        queryKey: ["entity", entity, seq],
        queryFn: () => entityServer.get<T>(entity, seq!),
        enabled: seq != null,
    });
}

/** 목록 조회 */
export function useEntityList<T = unknown>(
    entity: string,
    params: EntityListParams = {},
) {
    return useQuery({
        queryKey: ["entity", entity, "list", params],
        queryFn: () => entityServer.list<T>(entity, params),
    });
}

/** 건수 조회 */
export function useEntityCount(entity: string) {
    return useQuery({
        queryKey: ["entity", entity, "count"],
        queryFn: () => entityServer.count(entity),
    });
}

/** 필터 검색 */
export function useEntityQuery<T = unknown>(
    entity: string,
    filter: EntityQueryFilter[],
    params: EntityListParams = {},
) {
    return useQuery({
        queryKey: ["entity", entity, "query", filter, params],
        queryFn: () => entityServer.query<T>(entity, filter, params),
        enabled: filter.length > 0,
    });
}

/** 변경 이력 조회 */
export function useEntityHistory<T = unknown>(
    entity: string,
    seq: number | null,
) {
    return useQuery({
        queryKey: ["entity", entity, seq, "history"],
        queryFn: () => entityServer.history<T>(entity, seq!),
        enabled: seq != null,
    });
}

// ─── 뮤테이션 훅 ─────────────────────────────────────────────────────────────

/** 생성 또는 수정 */
export function useEntitySubmit(entity: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Record<string, unknown>) =>
            entityServer.submit(entity, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["entity", entity] });
        },
    });
}

/** 삭제 */
export function useEntityDelete(entity: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (seq: number) => entityServer.delete(entity, seq),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["entity", entity] });
        },
    });
}

/** 롤백 */
export function useEntityRollback(entity: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (historySeq: number) =>
            entityServer.rollback(entity, historySeq),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["entity", entity] });
        },
    });
}
