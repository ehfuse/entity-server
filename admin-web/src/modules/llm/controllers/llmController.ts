// modules/llm/controllers/llmController.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { admin } from "../../../api/entityServerClient";
import type {
    LlmDocumentIngestRequest,
    LlmProvidersResponse,
    LlmUsageSummaryResponse,
    LlmDocumentListResponse,
    LlmConversationListResponse,
    LlmUsageResponse,
    LlmConversationDetail,
} from "../models/types/llm";

export const useLlmController = () => {
    const queryClient = useQueryClient();

    // ── 프로바이더 목록 ──
    const providersQuery = useQuery({
        queryKey: ["llm-providers"],
        queryFn: () => admin.get<LlmProvidersResponse>("/v1/llm/providers"),
        retry: 1,
    });

    // ── 사용량 요약 ──
    const usageSummaryQuery = useQuery({
        queryKey: ["llm-usage-summary"],
        queryFn: () =>
            admin.get<LlmUsageSummaryResponse>("/v1/llm/usage/summary"),
    });

    // ── RAG 문서 목록 ──
    const documentsQuery = useQuery({
        queryKey: ["llm-documents"],
        queryFn: () =>
            admin.get<LlmDocumentListResponse>("/v1/llm/rag/documents", {
                page: 1,
                limit: 50,
            }),
    });

    // ── 대화 목록 ──
    const conversationsQuery = useQuery({
        queryKey: ["llm-conversations"],
        queryFn: () =>
            admin.get<LlmConversationListResponse>("/v1/llm/conversations", {
                limit: 50,
            }),
    });

    // ── 캐시 통계 ──
    const cacheStatsQuery = useQuery({
        queryKey: ["llm-cache-stats"],
        queryFn: () =>
            admin.get<{
                ok: boolean;
                data: import("../models/types/llm").LlmCacheStats;
            }>("/v1/llm/cache/stats"),
    });

    // ── 문서 인제스트 Mutation ──
    const ingestMutation = useMutation({
        mutationFn: (req: LlmDocumentIngestRequest) =>
            admin.post<{
                ok: boolean;
                data: { document_id: string; chunk_count: number };
            }>("/v1/llm/rag/documents", req),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["llm-documents"] });
        },
    });

    // ── 문서 삭제 ──
    const deleteDocumentMutation = useMutation({
        mutationFn: (id: string) =>
            admin.delete<{ ok: boolean }>(`/v1/llm/rag/documents/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["llm-documents"] });
        },
    });

    // ── 인덱스 재구성 ──
    const rebuildIndexMutation = useMutation({
        mutationFn: () =>
            admin.post<{ ok: boolean }>("/v1/llm/rag/rebuild-index"),
    });

    // ── 대화 삭제 ──
    const deleteConversationMutation = useMutation({
        mutationFn: (seq: number) =>
            admin.delete<{ ok: boolean }>(`/v1/llm/conversations/${seq}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["llm-conversations"] });
        },
    });

    // ── 캐시 클리어 ──
    const clearCacheMutation = useMutation({
        mutationFn: () => admin.delete<{ ok: boolean }>("/v1/llm/cache"),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["llm-cache-stats"] });
        },
    });

    return {
        // providers
        providers: providersQuery.data?.data ?? [],
        providersLoading: providersQuery.isLoading,
        isLlmEnabled: !providersQuery.isError && !providersQuery.isLoading,

        // usage
        usageSummary: usageSummaryQuery.data?.data ?? null,
        usageSummaryLoading: usageSummaryQuery.isLoading,

        // documents
        documents: documentsQuery.data?.data.items ?? [],
        documentsTotal: documentsQuery.data?.data.count ?? 0,
        documentsLoading: documentsQuery.isLoading,
        ingestDocument: (req: LlmDocumentIngestRequest) =>
            ingestMutation.mutateAsync(req),
        ingestLoading: ingestMutation.isPending,
        ingestError: ingestMutation.error?.message ?? null,
        deleteDocument: (id: string) => deleteDocumentMutation.mutate(id),
        rebuildIndex: () => rebuildIndexMutation.mutate(),
        rebuildLoading: rebuildIndexMutation.isPending,

        // conversations
        conversations: conversationsQuery.data?.data.items ?? [],
        conversationsTotal: conversationsQuery.data?.data.count ?? 0,
        conversationsLoading: conversationsQuery.isLoading,
        deleteConversation: (seq: number) =>
            deleteConversationMutation.mutate(seq),

        // cache
        cacheStats: cacheStatsQuery.data?.data ?? null,
        clearCache: () => clearCacheMutation.mutate(),
        clearCacheLoading: clearCacheMutation.isPending,

        // refresh
        refreshAll: () => {
            queryClient.invalidateQueries({ queryKey: ["llm-providers"] });
            queryClient.invalidateQueries({ queryKey: ["llm-usage-summary"] });
            queryClient.invalidateQueries({ queryKey: ["llm-documents"] });
            queryClient.invalidateQueries({ queryKey: ["llm-conversations"] });
        },
    };
};

export const useLlmUsageController = (params?: {
    provider?: string;
    start_date?: string;
    end_date?: string;
}) => {
    const usageQuery = useQuery({
        queryKey: ["llm-usage", params],
        queryFn: () =>
            admin.get<LlmUsageResponse>(
                "/v1/llm/usage",
                params as Record<string, unknown>,
            ),
    });

    return {
        usageItems: usageQuery.data?.data.items ?? [],
        usageCount: usageQuery.data?.data.count ?? 0,
        usageLoading: usageQuery.isLoading,
    };
};

export const useLlmConversationDetailController = (seq: number) => {
    const convQuery = useQuery({
        queryKey: ["llm-conversation", seq],
        queryFn: () =>
            admin.get<LlmConversationDetail>(`/v1/llm/conversations/${seq}`),
        enabled: !!seq,
    });

    return {
        conversation: convQuery.data?.data ?? null,
        conversationLoading: convQuery.isLoading,
    };
};
