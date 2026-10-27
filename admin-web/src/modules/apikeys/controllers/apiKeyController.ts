import { useState } from "react";
import { useModal } from "@ehfuse/forma";
import type { ApiKey, ApiKeyCreatedResponse } from "../models/types/apiKey";

/**
 * API 키 관리 다이얼로그/모달 전용 훅
 */
export const useApiKeyModals = () => {
    const [dialogApiKey, setDialogApiKey] = useState<ApiKey | null>(null);
    /** 생성/재생성 직후 평문 노출용 */
    const [createdApiKey, setCreatedApiKey] =
        useState<ApiKeyCreatedResponse | null>(null);

    const apiKeyDialog = useModal({
        modalId: "apiKeyDialog",
        onClose: () => {
            setDialogApiKey(null);
            setCreatedApiKey(null);
        },
    });

    const createdDialog = useModal({
        modalId: "apiKeyCreatedDialog",
    });

    const openCreateDialog = () => {
        setDialogApiKey(null);
        apiKeyDialog.open();
    };

    const openEditDialog = (apiKey: ApiKey) => {
        setDialogApiKey(apiKey);
        apiKeyDialog.open();
    };

    const showCreatedKey = (data: ApiKeyCreatedResponse) => {
        setCreatedApiKey(data);
        createdDialog.open();
    };

    return {
        apiKeyDialog,
        dialogApiKey,
        createdDialog,
        createdApiKey,
        openCreateDialog,
        openEditDialog,
        showCreatedKey,
    };
};
