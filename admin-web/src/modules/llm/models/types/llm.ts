// modules/llm/models/types/llm.ts — LLM 페이지 전용 타입 (entity-server-client 비의존)

export interface LlmMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface LlmChatRequest {
    provider?: string;
    messages: LlmMessage[];
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
}

export interface LlmChatResponse {
    ok: boolean;
    data: {
        content: string;
        provider: string;
        model: string;
        usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
        cached?: boolean;
    };
}

export interface LlmConversationCreateRequest {
    title?: string;
    provider?: string;
    system_prompt?: string;
}

export interface LlmConversationUpdateRequest {
    title?: string;
}

export interface LlmConversationSummary {
    seq: number;
    user_seq: number;
    title: string;
    provider: string;
    message_count: number;
    total_tokens: number;
    updated_at: string;
}

export interface LlmConversationListResponse {
    ok: boolean;
    data: { items: LlmConversationSummary[]; count: number };
}

export interface LlmConversationDetail {
    ok: boolean;
    data: {
        seq: number;
        title: string;
        provider: string;
        messages: LlmMessage[];
        total_tokens: number;
        created_at: string;
        updated_at: string;
    };
}

export interface LlmProviderInfo {
    name: string;
    driver: string;
    model: string;
    status: "ok" | "error";
    is_default: boolean;
}

export interface LlmProvidersResponse {
    ok: boolean;
    data: LlmProviderInfo[];
}

export interface LlmUsageRecord {
    provider: string;
    model: string;
    date: string;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost: number;
}

export interface LlmUsageResponse {
    ok: boolean;
    data: { items: LlmUsageRecord[]; count: number };
}

export interface LlmUsageSummaryResponse {
    ok: boolean;
    data: {
        total_requests: number;
        total_tokens: number;
        estimated_cost: number;
        by_provider: Record<
            string,
            { requests: number; tokens: number; cost: number }
        >;
    };
}

export interface LlmDocumentIngestRequest {
    title: string;
    content: string;
    content_type?: "text" | "markdown" | "pdf";
    provider?: string;
    chunk_size?: number;
    chunk_overlap?: number;
    metadata?: Record<string, unknown>;
}

export interface LlmDocumentIngestResponse {
    ok: boolean;
    data: { document_id: string; chunk_count: number };
}

export interface LlmDocumentSummary {
    document_id: string;
    title: string;
    content_type: string;
    chunk_count: number;
    created_at: string;
}

export interface LlmDocumentListResponse {
    ok: boolean;
    data: { items: LlmDocumentSummary[]; count: number };
}

export interface LlmRAGSearchRequest {
    query: string;
    provider?: string;
    top_k?: number;
    threshold?: number;
}

export interface LlmRAGSearchResponse {
    ok: boolean;
    data: {
        results: Array<{
            document_id: string;
            chunk_index: number;
            content: string;
            score: number;
        }>;
    };
}

export interface LlmRAGChatRequest extends LlmChatRequest {
    rag_options?: {
        top_k?: number;
        threshold?: number;
        include_sources?: boolean;
    };
}

export interface LlmCacheStats {
    enabled: boolean;
    hits: number;
    misses: number;
    hit_rate: number;
    entries: number;
    ttl_seconds: number;
}
