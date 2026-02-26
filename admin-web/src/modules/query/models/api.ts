import { admin, entityServer } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type {
    EntitySummary,
    QueryRequestPayload,
    QueryResultData,
} from "./types/query";

export const queryApi = {
    getEntities: async (): Promise<EntitySummary[]> => {
        const response = await admin.get<
            ApiResponse<
                PaginatedResponse<EntitySummary, { entity_count?: number }>
            >
        >("/v1/admin/entities", { page: 1, page_size: 1000 });
        return response.data?.items ?? [];
    },

    executeEntityQuery: async (
        entityName: string,
        payload: QueryRequestPayload,
    ): Promise<QueryResultData> => {
        const response = await entityServer.query(entityName, payload);
        return (response as unknown as QueryResultData) ?? {
            items: [],
            count: 0,
        };
    },
};
