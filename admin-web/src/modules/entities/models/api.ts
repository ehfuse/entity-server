import { entityAdmin } from "../../../api/entityAdminClient";
import { entityServer } from "../../../api/entityServerClient";

export const entitiesApi = {
    ...entityAdmin,

    // ─── 일반 엔티티 데이터 CRUD (admin 라우트 아님) ──────────────────────────

    getEntityData: async (entityName: string, page = 1, pageSize = 20) => {
        const response = await entityServer.list<Record<string, unknown>>(
            entityName,
            { page, limit: pageSize },
        );
        const items = response.data?.items || [];
        return {
            items,
            total: response.data?.total || 0,
            page,
            page_size: pageSize,
        };
    },

    createEntityData: async (
        entityName: string,
        data: Record<string, unknown>,
    ) => {
        return entityServer.submit(entityName, data);
    },

    updateEntityData: async (
        entityName: string,
        seq: string,
        data: Record<string, unknown>,
    ) => {
        return entityServer.submit(entityName, {
            ...data,
            seq,
        });
    },

    deleteEntityData: async (entityName: string, id: string) => {
        return entityServer.delete(entityName, Number(id));
    },
};
