import type { PaginatedResponse } from "../../../shared/models/types/api";

/** 엔티티 목록/상세/데이터 전역 상태입니다. */
export interface EntityState {
    /** 엔티티 목록 페이지 데이터 */
    entitiesPage: PaginatedResponse<Entity, EntitiesPageSummary> | null;
    /** 현재 선택된 엔티티 상세 정보 */
    selectedEntity: Entity | null;
    /** 현재 선택된 엔티티의 데이터 목록 */
    entityDataPage: PaginatedResponse<Record<string, unknown>> | null;
    /** 목록 페이지 번호 (1-based) */
    page: number;
    /** 페이지당 항목 수 */
    pageSize: number;
    /** 로딩 여부 */
    isLoading: boolean;
    /** 에러 메시지 */
    error: string | null;
}

/** 엔티티 생성/수정 폼 타입입니다. */
export interface EntityForm {
    name: string;
    description: string;
    fields: EntityField[];
    hooks: EntityHook[];
}

export interface Entity {
    id: string;
    name: string;
    description?: string;
    db_group?: string;
    fields: EntityField[];
    hooks?: EntityHook[];
    table_summary?: EntityTableSummary;
    created_time: string;
}

export interface EntityTableSummary {
    data_table: string;
    index_table: string;
    history_table: string;
    total_records: number;
    deleted_records: number;
    data_size_bytes: number;
    index_size_bytes: number;
    history_size_bytes: number;
    total_size_bytes: number;
}

export interface EntitiesPageSummary {
    scope: "page";
    entity_count: number;
    total_records: number;
    deleted_records: number;
    total_size_bytes: number;
}

export interface EntityField {
    name: string;
    type: string;
    required?: boolean;
    unique?: boolean;
    default?: unknown;
    validation?: Record<string, unknown>;
}

export interface EntityHook {
    type:
        | "before_create"
        | "after_create"
        | "before_update"
        | "after_update"
        | "before_delete"
        | "after_delete";
    script: string;
}
