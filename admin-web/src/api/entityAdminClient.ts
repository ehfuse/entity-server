/**
 * entityAdminClient.ts
 *
 * /v1/admin/* 라우트 호출을 모두 이 파일에서 관리합니다.
 * 각 모듈의 models/api.ts 는 이 파일을 import 하여 re-export 합니다.
 */

import { admin } from "./entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../modules/shared/models/types/api";

// ─── Types ────────────────────────────────────────────────────────────────────
import type {
    Entity,
    EntitiesPageSummary,
} from "../modules/entities/models/types/entity";
import type { ERDSchemaResponse } from "../modules/erd/models/types/erd";
import type {
    ApiKey,
    ApiKeyCreatedResponse,
} from "../modules/apikeys/models/types/apiKey";
import type { Account } from "../modules/accounts/models/types/account";
import type { RbacRole } from "../modules/roles/models/types/role";
import type { License } from "../modules/licenses/models/types/license";
import type {
    ConfigsResponse,
    ConfigDomain,
    ConfigUpdateResponse,
} from "../modules/configs/models/types/config";
import type { EntitySummary } from "../modules/query/models/types/query";

// ─── Entities (/v1/admin/entities, /v1/admin/:entity/*) ──────────────────────

export const entityAdmin = {
    /** 엔티티 목록 조회 */
    getEntities: async () => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<Entity, EntitiesPageSummary>>
        >("/v1/admin/entities", { page: 1, page_size: 1000 });
        return (
            response.data || {
                items: [],
                total: 0,
                page: 1,
                page_size: 1000,
                summary: {
                    scope: "page",
                    entity_count: 0,
                    total_records: 0,
                    deleted_records: 0,
                    total_size_bytes: 0,
                },
            }
        );
    },

    /** 엔티티 메타 단건 조회 */
    getEntity: async (name: string) => {
        return admin.get<ApiResponse<Entity>>(`/v1/entity/${name}/meta`);
    },

    /** 엔티티 생성 (객체 방식) */
    createEntity: async (entity: Partial<Entity>) => {
        const entityName = entity.name?.trim();
        if (!entityName) {
            throw new Error("엔티티 이름이 필요합니다.");
        }
        return admin.post<ApiResponse<Entity>>(
            `/v1/admin/${entityName}/create`,
            entity,
        );
    },

    /** 엔티티 설정 수정 (객체 방식) */
    updateEntity: async (name: string, entity: Partial<Entity>) => {
        return admin.put<ApiResponse<Entity>>(
            `/v1/admin/${name}/config`,
            entity,
        );
    },

    /** 엔티티 설정 파일 raw JSON 텍스트 조회 */
    getEntityConfigRaw: async (name: string): Promise<string> => {
        const response = await admin.get<ApiResponse<string>>(
            `/v1/admin/${name}/config`,
        );
        return response.data ?? "";
    },

    /** 엔티티 설정 파일에 raw JSON 텍스트를 저장 (수정) */
    updateEntityConfigRaw: async (name: string, rawJson: string) => {
        return admin.put<ApiResponse>(`/v1/admin/${name}/config`, rawJson);
    },

    /**
     * 엔티티 신규 생성.
     * @param group 엔티티 그룹 (생략/`default` → `configs/:entity.json`,
     *              그 외 → `configs/:group/:entity.json`)
     */
    createEntityConfigRaw: async (
        name: string,
        rawJson: string,
        group?: string,
    ) => {
        const path =
            group && group !== "default"
                ? `/v1/admin/${group}/${name}/create`
                : `/v1/admin/${name}/create`;
        return admin.post<ApiResponse>(path, rawJson);
    },

    /** 저장 전 서버 규칙으로 검증 */
    validateEntityConfigRaw: async (rawJson: string) => {
        return admin.post<ApiResponse>("/v1/admin/entity/validate", rawJson);
    },

    /** 저장 전 서버 규칙으로 정규화 */
    normalizeEntityConfigRaw: async (rawJson: string) => {
        return admin.post<ApiResponse<{ json: string; rules: string[] }>>(
            "/v1/admin/entity/normalize",
            rawJson,
        );
    },

    /** 스키마만 동기화 (ALTER TABLE, 데이터 재색인 없음) */
    syncEntitySchema: async (name: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/sync-schema`);
    },

    /** 스키마 동기화 + 전체 데이터 재색인 */
    reindexEntity: async (name: string) => {
        return admin.post<ApiResponse<{ indexed: number }>>(
            `/v1/admin/${name}/reindex`,
        );
    },

    /** 엔티티 데이터를 전부 삭제 (테이블 구조는 유지) */
    truncateEntity: async (name: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/truncate`);
    },

    /** 엔티티 초기화 (테이블/인덱스 재생성, 데이터 삭제) */
    resetEntity: async (name: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/reset`);
    },

    /** 전체 엔티티 초기화 */
    resetAllEntities: async () => {
        return admin.post<ApiResponse>(`/v1/admin/reset-all`);
    },

    /** 전체 엔티티 인덱스 재구성 */
    reindexAllEntities: async () => {
        return admin.post<ApiResponse>(`/v1/admin/reindex-all`);
    },

    /** 엔티티 삭제 (테이블 + entities row 제거) */
    deleteEntity: async (name: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/drop`, undefined, {
            params: { confirm: `DROP_${name}` },
        });
    },

    /** 엔티티 레코드 통계 조회 */
    getEntityStats: async (entityName: string) => {
        return admin.get<ApiResponse<{ total?: number }>>(
            `/v1/admin/${entityName}/stats`,
        );
    },
};

// ─── ERD (/v1/admin/erd/schema) ───────────────────────────────────────────────

export const erdAdmin = {
    /** ERD 스키마 조회 */
    getSchema: async (): Promise<ERDSchemaResponse> => {
        const response = await admin.get<ApiResponse<ERDSchemaResponse>>(
            "/v1/admin/erd/schema",
        );
        return response.data || { entities: [] };
    },
};

// ─── API Keys (/v1/admin/api-keys) ───────────────────────────────────────────

export const apiKeysAdmin = {
    getApiKeys: async (params?: {
        page?: number;
        page_size?: number;
        search?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<ApiKey>>
        >("/v1/admin/api-keys", { page: 1, page_size: 50, ...params });
        return response.data || { items: [], total: 0, page: 1, page_size: 50 };
    },

    getApiKey: async (seq: number | string) => {
        const response = await admin.get<ApiResponse<ApiKey>>(
            `/v1/admin/api-keys/${seq}`,
        );
        return response.data;
    },

    createApiKey: async (data: {
        role: string;
        description?: string;
        enabled?: boolean;
        account_seq?: number | null;
        entities?: string;
    }) => {
        return admin.post<ApiResponse<ApiKeyCreatedResponse>>(
            "/v1/admin/api-keys",
            data,
        );
    },

    updateApiKey: async (
        seq: number | string,
        data: {
            role?: string;
            description?: string;
            enabled?: boolean;
            account_seq?: number | null;
            entities?: string;
        },
    ) => {
        return admin.patch<ApiResponse<ApiKey>>(
            `/v1/admin/api-keys/${seq}`,
            data,
        );
    },

    deleteApiKey: async (seq: number | string) => {
        return admin.delete<ApiResponse<void>>(`/v1/admin/api-keys/${seq}`);
    },

    regenerateSecret: async (seq: number | string) => {
        return admin.post<ApiResponse<ApiKeyCreatedResponse>>(
            `/v1/admin/api-keys/${seq}/regenerate-secret`,
        );
    },
};

// ─── Accounts (/v1/admin/accounts) ───────────────────────────────────────────

export const accountsAdmin = {
    getUsers: async (params?: {
        page?: number;
        page_size?: number;
        search?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<Account>>
        >("/v1/admin/accounts", { page: 1, page_size: 50, ...params });
        return response.data || { items: [], total: 0, page: 1, page_size: 50 };
    },

    getAccount: async (id: string) => {
        const response = await admin.get<ApiResponse<Account>>(
            `/v1/admin/accounts/${id}`,
        );
        return response.data;
    },

    createAccount: async (data: Partial<Account> & { password?: string }) => {
        return admin.post<ApiResponse<Account>>("/v1/admin/accounts", data);
    },

    updateAccount: async (
        id: string,
        data: Partial<Account> & { password?: string },
    ) => {
        return admin.patch<ApiResponse<Account>>(
            `/v1/admin/accounts/${id}`,
            data,
        );
    },

    deleteAccount: async (id: string) => {
        return admin.delete<ApiResponse<void>>(`/v1/admin/accounts/${id}`);
    },

    toggleActive: async (id: string, isActive: boolean) => {
        return admin.patch<ApiResponse<Account>>(`/v1/admin/accounts/${id}`, {
            status: isActive ? "active" : "inactive",
        });
    },
};

// ─── Roles (/v1/admin/roles) ─────────────────────────────────────────────────

export const rolesAdmin = {
    getRoles: async (params?: {
        page?: number;
        page_size?: number;
        search?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<RbacRole>>
        >("/v1/admin/roles", { page: 1, page_size: 100, ...params });
        return (
            response.data || { items: [], total: 0, page: 1, page_size: 100 }
        );
    },

    getRole: async (seq: number | string) => {
        const response = await admin.get<ApiResponse<RbacRole>>(
            `/v1/admin/roles/${seq}`,
        );
        return response.data;
    },

    createRole: async (data: {
        name: string;
        description?: string;
        permissions?: string[];
    }) => {
        return admin.post<ApiResponse<RbacRole>>("/v1/admin/roles", data);
    },

    updateRole: async (
        seq: number | string,
        data: {
            name?: string;
            description?: string;
            permissions?: string[];
        },
    ) => {
        return admin.patch<ApiResponse<RbacRole>>(
            `/v1/admin/roles/${seq}`,
            data,
        );
    },

    deleteRole: async (seq: number | string) => {
        return admin.delete<ApiResponse<void>>(`/v1/admin/roles/${seq}`);
    },
};

// ─── Licenses (/v1/admin/licenses) ───────────────────────────────────────────

export const licensesAdmin = {
    getLicenses: async (params?: {
        page?: number;
        page_size?: number;
        status?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<License>>
        >("/v1/admin/licenses", { page: 1, page_size: 50, ...params });
        return response.data || { items: [], total: 0, page: 1, page_size: 50 };
    },

    getLicense: async (id: string) => {
        const response = await admin.get<ApiResponse<License>>(
            `/v1/admin/licenses/${id}`,
        );
        return response.data;
    },

    createLicense: async (data: Partial<License>) => {
        return admin.post<ApiResponse<License>>("/v1/admin/licenses", data);
    },

    updateLicense: async (id: string, data: Partial<License>) => {
        return admin.patch<ApiResponse<License>>(
            `/v1/admin/licenses/${id}`,
            data,
        );
    },

    deleteLicense: async (id: string) => {
        return admin.delete<ApiResponse<void>>(`/v1/admin/licenses/${id}`);
    },
};

// ─── Server Configs (/v1/admin/configs) ──────────────────────────────────────

export const configsAdmin = {
    /** 전체 설정을 도메인별로 그룹화하여 조회합니다. */
    getConfigs: async () => {
        const response =
            await admin.get<ApiResponse<ConfigsResponse>>("/v1/admin/configs");
        return response.data || { items: [], total: 0 };
    },

    /** 특정 도메인의 설정을 조회합니다. */
    getConfig: async (domain: string) => {
        const response = await admin.get<ApiResponse<ConfigDomain>>(
            `/v1/admin/configs/${domain}`,
        );
        return response.data;
    },

    /** 특정 도메인의 설정을 업데이트합니다 (PATCH 병합). */
    updateConfig: async (domain: string, config: Record<string, unknown>) => {
        return admin.patch<ApiResponse<ConfigUpdateResponse>>(
            `/v1/admin/configs/${domain}`,
            config,
        );
    },
};

// ─── Query (엔티티 목록 조회 — query 모듈 전용) ───────────────────────────────

export const queryAdmin = {
    /** 쿼리 모듈용 엔티티 목록 조회 */
    getEntities: async (): Promise<EntitySummary[]> => {
        const response = await admin.get<
            ApiResponse<
                PaginatedResponse<EntitySummary, { entity_count?: number }>
            >
        >("/v1/admin/entities", { page: 1, page_size: 1000 });
        return response.data?.items ?? [];
    },
};
