import { admin } from "../../../api/entityServerClient";
import type { ApiResponse } from "../../shared/models/types/api";
import type { ERDSchemaResponse } from "./types/erd";

export const erdApi = {
    getSchema: async (includeDB = false): Promise<ERDSchemaResponse> => {
        const response = await admin.get<ApiResponse<ERDSchemaResponse>>(
            "/v1/admin/erd/schema",
            { include_db: includeDB },
        );
        return (
            response.data || {
                entities: [],
                include_db: includeDB,
            }
        );
    },
};
