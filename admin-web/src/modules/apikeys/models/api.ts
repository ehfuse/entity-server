import { admin } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type { ApiKey, ApiKeyCreatedResponse } from "./types/apiKey";

export const apiKeysApi = {
    getApiKeys: async (params?: {
        page?: number;
        page_size?: number;
        search?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<ApiKey>>
        >("/v1/admin/api-keys", { page: 1, page_size: 50, ...params });
        return (
            response.data || { items: [], total: 0, page: 1, page_size: 50 }
        );
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
