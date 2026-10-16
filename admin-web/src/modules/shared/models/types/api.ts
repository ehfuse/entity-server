export interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    message?: string;
}

export interface PaginatedResponse<T, S = unknown> {
    items: T[];
    total: number;
    page: number;
    page_size: number;
    summary?: S;
}
