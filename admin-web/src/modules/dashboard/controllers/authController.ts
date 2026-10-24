// modules/dashboard/controllers/authController.ts
import { useLoginController } from "../../login/controllers/loginController";

export const useAuthController = () => {
    const { state } = useLoginController();
    return {
        logout: () => state.actions.logout(),
    };
};
