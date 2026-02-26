import { admin } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type { License } from "./types/license";

export const licensesApi = {
    getLicenses: async (params?: {
        page?: number;
        page_size?: number;
        status?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<License>>
        >("/v1/admin/licenses", { page: 1, page_size: 50, ...params });
        return (
            response.data || { items: [], total: 0, page: 1, page_size: 50 }
        );
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
