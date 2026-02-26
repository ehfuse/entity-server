import { admin } from "../../../api/entityServerClient";
import type { ApiResponse } from "../../shared/models/types/api";
import type {
    ConfigsResponse,
    ConfigDomain,
    ConfigUpdateResponse,
} from "./types/config";

export const configsApi = {
    /** 전체 설정을 도메인별로 그룹화하여 조회합니다. */
    getConfigs: async () => {
        const response = await admin.get<ApiResponse<ConfigsResponse>>(
            "/v1/admin/configs",
        );
        return response.data || { items: [], total: 0 };
    },

    /** 특정 도메인의 설정을 조회합니다. */
    getConfig: async (domain: string) => {
        const response = await admin.get<ApiResponse<ConfigDomain>>(
            `/v1/admin/configs/${domain}`,
        );
        return response.data;
    },

    /** 특정 도메인의 설정을 업데이트합니다 (PATCH 병합). */
    updateConfig: async (domain: string, config: Record<string, unknown>) => {
        return admin.patch<ApiResponse<ConfigUpdateResponse>>(
            `/v1/admin/configs/${domain}`,
            config,
        );
    },
};
