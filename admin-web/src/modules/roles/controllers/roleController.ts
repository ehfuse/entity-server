import { useState } from "react";
import { useModal } from "@ehfuse/forma";
import type { RbacRole } from "../models/types/role";

/**
 * 역할 관리 다이얼로그/모달 전용 훅
 */
export const useRoleModals = () => {
    const [dialogRole, setDialogRole] = useState<RbacRole | null>(null);

    const roleDialog = useModal({
        modalId: "roleDialog",
        onClose: () => setDialogRole(null),
    });

    const openCreateDialog = () => {
        setDialogRole(null);
        roleDialog.open();
    };

    const openEditDialog = (role: RbacRole) => {
        setDialogRole(role);
        roleDialog.open();
    };

    return {
        roleDialog,
        dialogRole,
        openCreateDialog,
        openEditDialog,
    };
};
