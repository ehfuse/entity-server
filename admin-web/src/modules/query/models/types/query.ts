export interface EntitySummary {
    name: string;
    description?: string;
}

export interface QueryRequestPayload {
    sql: string;
    params?: unknown[];
    limit?: number;
}

export interface QueryResultData {
    items: Record<string, unknown>[];
    count: number;
}

export interface QueryState {
    entityName: string;
    sql: string;
    paramsText: string;
    limitText: string;
}
