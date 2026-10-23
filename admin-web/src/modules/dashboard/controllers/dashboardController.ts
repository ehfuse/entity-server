import { useEffect } from "react";
import { useGlobalFormaState } from "@ehfuse/forma";
import { authApi } from "../../login/models/api";
import { useLoginController } from "../../login/controllers/loginController";
import type { AdminState } from "../models/types/admin-state";
import * as Actions from "./actions/dashboardActions";

const initialDashboardState: AdminState = {
    user: null,
    loadingMe: false,
    initialized: false,
};

export const useDashboardController = () => {
    const {
        user: authUser,
        isAuthenticated,
        state: authState,
    } = useLoginController();
    const state = useGlobalFormaState<AdminState>({
        stateId: "adminState",
        initialValues: initialDashboardState,
        actions: {
            reset: Actions.reset(initialDashboardState),
            syncAuthUser: Actions.syncAuthUser(),
            beginHydration: Actions.beginHydration(),
            setHydratedUser: Actions.setHydratedUser(),
            endHydration: Actions.endHydration(),
        },
    });

    const user = state.useValue("user") as AdminState["user"];
    const loadingMe = state.useValue("loadingMe") as boolean;
    const initialized = state.useValue("initialized") as boolean;

    useEffect(() => {
        if (!isAuthenticated) {
            state.actions.reset();
            return;
        }

        if (authUser) {
            state.actions.syncAuthUser(authUser);
            return;
        }

        if (loadingMe || initialized) {
            return;
        }

        let cancelled = false;
        state.actions.beginHydration();

        authApi
            .getCurrentUser()
            .then((response) => {
                if (cancelled) {
                    return;
                }
                if (response.ok && response.data) {
                    authState.actions.setUser(response.data);
                    state.actions.setHydratedUser(response.data);
                } else {
                    state.actions.setHydratedUser(null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    state.actions.setHydratedUser(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    state.actions.endHydration();
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, authUser, authState, loadingMe, initialized, state]);

    return {
        state,
        user,
        loadingMe,
        initialized,
    };
};
