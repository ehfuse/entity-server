// modules/dashboard/controllers/adminController.ts
import { useDashboardController } from "./dashboardController";

export const useAdminController = () => {
    const { user } = useDashboardController();
    return { user };
};
