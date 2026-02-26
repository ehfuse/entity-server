import { admin, entityServer } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type { Entity, EntitiesPageSummary } from "./types/entity";

export const entitiesApi = {
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

    getEntity: async (name: string) => {
        return admin.get<ApiResponse<Entity>>(`/v1/entity/${name}/meta`);
    },

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

    updateEntity: async (name: string, entity: Partial<Entity>) => {
        return admin.put<ApiResponse<Entity>>(`/v1/admin/${name}/config`, entity);
    },

    /** 엔티티 설정 파일 raw JSON 텍스트 조회 */
    getEntityConfigRaw: async (name: string): Promise<string> => {
        const response = await admin.get<ApiResponse<string>>(
            `/v1/admin/${name}/config`,
        );
        return response.data ?? "";
    },

    /** 엔티티 설정 파일에 raw JSON 텍스트를 검증 후 저장 */
    updateEntityConfigRaw: async (name: string, rawJson: string) => {
        return admin.put<ApiResponse>(`/v1/admin/${name}/config`, rawJson);
    },

    /** 엔티티 신규 생성 */
    createEntityConfigRaw: async (name: string, rawJson: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/create`, rawJson);
    },

    /** 저장 전 서버 규칙으로 검증 */
    validateEntityConfigRaw: async (rawJson: string, name?: string) => {
        const path = name
            ? `/v1/admin/${name}/validate`
            : "/v1/admin/entity/validate";
        return admin.post<ApiResponse>(path, rawJson);
    },

    /** 저장 전 서버 규칙으로 정규화 */
    normalizeEntityConfigRaw: async (rawJson: string, name?: string) => {
        const path = name
            ? `/v1/admin/${name}/normalize`
            : "/v1/admin/entity/normalize";
        return admin.post<ApiResponse<{ json: string; rules: string[] }>>(
            path,
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

    /** 엔티티를 초기화 (설정 기준으로 테이블/인덱스 재생성, 데이터 삭제) */
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

    deleteEntity: async (name: string) => {
        return admin.post<ApiResponse>(`/v1/admin/${name}/drop`, undefined, {
            params: { confirm: `DROP_${name}` },
        });
    },

    getEntityStats: async (entityName: string) => {
        return admin.get<ApiResponse<{ total?: number }>>(
            `/v1/admin/${entityName}/stats`,
        );
    },

    getEntityData: async (entityName: string, page = 1, pageSize = 20) => {
        const response = await entityServer.list<Record<string, unknown>>(
            entityName,
            { page, limit: pageSize },
        );
        const items = response.data || [];
        return {
            items,
            total: response.total || 0,
            page,
            page_size: pageSize,
        };
    },

    createEntityData: async (
        entityName: string,
        data: Record<string, unknown>,
    ) => {
        return entityServer.submit<Record<string, unknown>>(entityName, data);
    },

    updateEntityData: async (
        entityName: string,
        seq: string,
        data: Record<string, unknown>,
    ) => {
        return entityServer.submit<Record<string, unknown>>(entityName, {
            ...data,
            seq,
        });
    },

    deleteEntityData: async (entityName: string, id: string) => {
        return entityServer.delete(entityName, Number(id));
    },
};
