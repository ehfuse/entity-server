import { useState } from "react";
import { useModal } from "@ehfuse/forma";
import type { Account } from "../models/types/account";

/**
 * 사용자 관리 다이얼로그/모달 전용 훅
 */
export const useAccountModals = () => {
    const [dialogAccount, setDialogUser] = useState<Account | null>(null);

    const accountDialog = useModal({
        modalId: "accountDialog",
        onClose: () => setDialogUser(null),
    });

    const openCreateDialog = () => {
        setDialogUser(null);
        accountDialog.open();
    };

    const openEditDialog = (user: Account) => {
        setDialogUser(user);
        accountDialog.open();
    };

    return {
        accountDialog,
        dialogAccount,
        openCreateDialog,
        openEditDialog,
    };
};
