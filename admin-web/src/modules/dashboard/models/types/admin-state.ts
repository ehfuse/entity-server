import type { User } from "../../../login/models/types/auth";

export interface AdminState {
    user: User | null;
    loadingMe: boolean;
    initialized: boolean;
}
