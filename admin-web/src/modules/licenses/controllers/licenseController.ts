import { useState } from "react";
import { useModal } from "@ehfuse/forma";
import type { License } from "../models/types/license";

/**
 * 라이선스 관리 다이얼로그/모달 전용 훅
 */
export const useLicenseModals = () => {
    const [dialogLicense, setDialogLicense] = useState<License | null>(null);

    const licenseDialog = useModal({
        modalId: "licenseDialog",
        onClose: () => setDialogLicense(null),
    });

    const openCreateDialog = () => {
        setDialogLicense(null);
        licenseDialog.open();
    };

    const openEditDialog = (license: License) => {
        setDialogLicense(license);
        licenseDialog.open();
    };

    return {
        licenseDialog,
        dialogLicense,
        openCreateDialog,
        openEditDialog,
    };
};
