import type { ActionContext } from "@ehfuse/forma";
import type { AdminState } from "../../models";

// 대시보드 상태를 초기값으로 재설정합니다.
export const reset =
    (initialState: AdminState) => (context: ActionContext<AdminState>) => {
        context.setValues(initialState);
    };

// 인증 스토어의 사용자 정보를 대시보드 상태에 동기화합니다.
export const syncAuthUser =
    () => (context: ActionContext<AdminState>, user: AdminState["user"]) => {
        context.setValues({
            user,
            loadingMe: false,
            initialized: true,
        });
    };

// 초기 사용자 정보 조회 시작 상태를 표시합니다.
export const beginHydration = () => (context: ActionContext<AdminState>) => {
    context.setValue("loadingMe", true);
};

// 조회된 사용자 정보를 대시보드 상태에 반영합니다.
export const setHydratedUser =
    () => (context: ActionContext<AdminState>, user: AdminState["user"]) => {
        context.setValue("user", user);
    };

// 초기 사용자 정보 조회 완료 상태를 반영합니다.
export const endHydration = () => (context: ActionContext<AdminState>) => {
    context.setValues({
        loadingMe: false,
        initialized: true,
    });
};
