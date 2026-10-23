import type { Account } from "./account";

export interface AuthState {
    user: Account | null;
    token: string | null;
    isAuthenticated: boolean;
}

export interface LoginState {
    user: Account | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
}

export interface LoginForm {
    email: string;
    passwd: string;
}

export interface LoginResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}
