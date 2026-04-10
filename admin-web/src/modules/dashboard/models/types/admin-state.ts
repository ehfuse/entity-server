import type { Account } from "../../../login/models/types/account";

export interface AdminState {
    user: Account | null;
    loadingMe: boolean;
    initialized: boolean;
}
