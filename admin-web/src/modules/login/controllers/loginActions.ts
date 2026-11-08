import type { ActionContext } from "@ehfuse/forma";
import type { LoginState } from "../models/types/auth";
import { entityServer } from "../../../api/entityServerClient";

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

// 사용자 정보를 설정하고 인증 상태를 동기화합니다.
export const setUser =
    () => (context: ActionContext<LoginState>, user: LoginState["user"]) => {
        context.setValue("user", user);
        context.setValue("isAuthenticated", !!user);
    };

// 액세스 토큰을 설정하고 인증 상태를 동기화합니다.
export const setAccessToken =
    () =>
    (
        context: ActionContext<LoginState>,
        accessToken: LoginState["accessToken"],
    ) => {
        if (typeof window !== "undefined") {
            if (accessToken) {
                localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            } else {
                localStorage.removeItem(ACCESS_TOKEN_KEY);
                localStorage.removeItem("auth_token");
            }
        }
        context.setValue("accessToken", accessToken);
        context.setValue("isAuthenticated", !!accessToken);
    };

// 리프레시 토큰을 상태에 반영합니다.
export const setRefreshToken =
    () =>
    (
        context: ActionContext<LoginState>,
        refreshToken: LoginState["refreshToken"],
    ) => {
        if (typeof window !== "undefined") {
            if (refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
            } else {
                localStorage.removeItem(REFRESH_TOKEN_KEY);
            }
        }
        context.setValue("refreshToken", refreshToken);
    };

// 로그인 성공 시 사용자/토큰/인증 상태를 일괄 반영합니다.
export const login =
    () =>
    (
        context: ActionContext<LoginState>,
        payload: {
            user: LoginState["user"];
            accessToken: LoginState["accessToken"];
            refreshToken?: LoginState["refreshToken"];
        },
    ) => {
        context.setValues({
            user: payload.user,
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken || null,
            isAuthenticated: true,
        });
    };

// 로그아웃 API 호출 후 인증 관련 상태를 초기화합니다.
export const logout = () => async (context: ActionContext<LoginState>) => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    try {
        if (refreshToken) {
            await entityServer.logout(refreshToken);
        }
    } catch {
        // 서버 로그아웃 실패해도 클라이언트 스토리지는 제거
    } finally {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem("auth_token");
        entityServer.setToken("");
        context.setValues({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
        });
    }
};
