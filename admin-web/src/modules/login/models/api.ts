import { admin } from "../../../api/entityServerClient";
import type { ApiResponse } from "../../shared/models/types/api";
import type { Account } from "./types/account";

export const authApi = {
    getCurrentUser: async () => {
        return admin.get<ApiResponse<Account>>("/v1/auth/me");
    },
};
