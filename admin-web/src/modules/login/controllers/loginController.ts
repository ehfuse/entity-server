import { useGlobalFormaState, useGlobalForm } from "@ehfuse/forma";
import type { LoginState, LoginForm } from "../models/types/auth";
import { authApi } from "../models/api";
import { entityServer } from "../../../api/entityServerClient";
import * as loginActions from "./loginActions";

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

// 브라우저 저장소 값을 기반으로 인증 초기 상태를 구성합니다.
const initialState: LoginState = {
    user: null,
    accessToken:
        typeof window !== "undefined"
            ? localStorage.getItem(ACCESS_TOKEN_KEY) ||
              localStorage.getItem("auth_token")
            : null,
    refreshToken:
        typeof window !== "undefined"
            ? localStorage.getItem(REFRESH_TOKEN_KEY)
            : null,
    isAuthenticated:
        typeof window !== "undefined"
            ? !!(
                  localStorage.getItem(ACCESS_TOKEN_KEY) ||
                  localStorage.getItem("auth_token")
              )
            : false,
};

// 인증 상태 조회/갱신을 담당하는 컨트롤러 훅입니다.
export const useLoginController = () => {
    const state = useGlobalFormaState<LoginState>({
        stateId: "auth",
        initialValues: initialState,
        actions: {
            setUser: loginActions.setUser(),
            setAccessToken: loginActions.setAccessToken(),
            setRefreshToken: loginActions.setRefreshToken(),
            login: loginActions.login(),
            logout: loginActions.logout(),
        },
    });

    const user = state.useValue("user") as LoginState["user"];
    const accessToken = state.useValue(
        "accessToken",
    ) as LoginState["accessToken"];
    const refreshToken = state.useValue(
        "refreshToken",
    ) as LoginState["refreshToken"];
    const isAuthenticated = state.useValue(
        "isAuthenticated",
    ) as LoginState["isAuthenticated"];

    const form = useGlobalForm<LoginForm>({
        formId: "loginForm",
        initialValues: { email: "", passwd: "" },
        onValidate: (values) => {
            return !!(values.email && values.passwd);
        },
        onSubmit: async (values) => {
            try {
                // entityServer.login()이 API 호출 후 토큰을 내부에 자동 설정합니다.
                const auth = await entityServer.login(
                    values.email,
                    values.passwd,
                );
                // apiClient(axios) 인터셉터 및 페이지 새로고침을 위해 localStorage에 저장합니다.
                localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
                localStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);

                const meResponse = await authApi.getCurrentUser();
                if (!meResponse.ok || !meResponse.data) return false;

                state.actions.login({
                    user: meResponse.data,
                    accessToken: auth.access_token,
                    refreshToken: auth.refresh_token,
                });
                return true;
            } catch {
                return false;
            }
        },
    });

    return {
        state,
        user,
        accessToken,
        refreshToken,
        isAuthenticated,
        form,
    };
};
