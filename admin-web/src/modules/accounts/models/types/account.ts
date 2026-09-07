export interface Account {
    id: string;
    email: string;
    status?: string;
    rbac_role?: string;
    max_session_cnt?: number;
    created_time?: string;
    updated_time?: string;
    last_login_time?: string;
}

export interface AccountState {
    usersPage:
        | import("../../../shared/models/types/api").PaginatedResponse<Account>
        | null;
    selectedUser: Account | null;
    page: number;
    pageSize: number;
    isLoading: boolean;
    error: string | null;
}
