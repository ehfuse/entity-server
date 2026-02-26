import { admin } from "../../../api/entityServerClient";
import type {
    ApiResponse,
    PaginatedResponse,
} from "../../shared/models/types/api";
import type { Account } from "./types/account";

export const accountsApi = {
    getUsers: async (params?: {
        page?: number;
        page_size?: number;
        search?: string;
    }) => {
        const response = await admin.get<
            ApiResponse<PaginatedResponse<Account>>
        >("/v1/admin/accounts", { page: 1, page_size: 50, ...params });
        return (
            response.data || { items: [], total: 0, page: 1, page_size: 50 }
        );
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
