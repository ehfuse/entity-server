import { entityServer } from "../../../api/entityServerClient";
import { queryAdmin } from "../../../api/entityAdminClient";
import type { QueryRequestPayload, QueryResultData } from "./types/query";

export const queryApi = {
    getEntities: queryAdmin.getEntities,

    executeEntityQuery: async (
        entityName: string,
        payload: QueryRequestPayload,
    ): Promise<QueryResultData> => {
        const response = await entityServer.query(entityName, payload);
        return (
            (response as unknown as QueryResultData) ?? {
                items: [],
                count: 0,
            }
        );
    },
};
