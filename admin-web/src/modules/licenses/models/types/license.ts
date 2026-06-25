export type LicenseScope = "global" | "entity";
export type LicenseStatus = "active" | "expired" | "suspended" | "pending";

export interface License {
    id: string;
    name?: string;
    key: string;
    description?: string;
    scope: LicenseScope;
    /** scope=entity 일 때 대상 엔티티 이름 목록 */
    entities?: string[];
    /** 역할 제한 (없으면 전체 허용) */
    allowed_roles?: string[];
    max_records?: number;
    status: LicenseStatus;
    issued_at?: string;
    expires_at?: string;
    created_at?: string;
    updated_at?: string;
    metadata?: Record<string, unknown>;
}

export interface LicenseState {
    licensesPage:
        | import("../../../shared/models/types/api").PaginatedResponse<License>
        | null;
    selectedLicense: License | null;
    page: number;
    pageSize: number;
    isLoading: boolean;
    error: string | null;
}
