import { admin } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type { RbacRole } from "./types/role";

export const rolesApi = {
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
