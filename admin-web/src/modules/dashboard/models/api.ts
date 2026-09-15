import { admin, entityServer, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../../api/entityServerClient";
import type { ApiResponse } from "../../shared/models/types/api";
import type { LoginForm, LoginResponse } from "../../login/models/types/auth";
import type { Account } from "../../login/models/types/account";

export const authApi = {
    login: async (credentials: LoginForm) => {
        const data = await entityServer.login(credentials.email, credentials.passwd);
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        if (data.refresh_token) {
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        }
        return { ok: true, data } as ApiResponse<LoginResponse>;
    },

    logout: async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
            try {
                await entityServer.logout(refreshToken);
            } catch {
                // 서버 로그아웃 실패해도 클라이언트 토큰은 제거
            }
        }
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem("auth_token");
        return { success: true };
    },

    getCurrentUser: async () => {
        return admin.get<ApiResponse<Account>>("/v1/auth/me");
    },
};

// entitiesApi → modules/entities/models/api.ts
// configsApi  → modules/configs/models/api.ts
