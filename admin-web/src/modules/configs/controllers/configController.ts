import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { configsApi } from "../models/api";

/** 설정 관리 페이지용 컨트롤러입니다. */
export const useConfigController = () => {
    const queryClient = useQueryClient();
    const [editingDomain, setEditingDomain] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [jsonError, setJsonError] = useState<string>("");
    const [successMessage, setSuccessMessage] = useState<string>("");

    const { data, isLoading, error } = useQuery({
        queryKey: ["configs"],
        queryFn: () => configsApi.getConfigs(),
    });

    const updateMutation = useMutation({
        mutationFn: ({
            domain,
            config,
        }: {
            domain: string;
            config: Record<string, unknown>;
        }) => configsApi.updateConfig(domain, config),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["configs"] });
            setEditingDomain(null);
            setEditValue("");
            setSuccessMessage(`${variables.domain} 설정이 저장되었습니다.`);
        },
        onError: (err: unknown) => {
            const e = err as { response?: { data?: { message?: string } } };
            alert(
                e.response?.data?.message ||
                    "설정 저장 중 오류가 발생했습니다.",
            );
        },
    });

    const handleStartEdit = useCallback(
        (domain: string, config: Record<string, unknown>) => {
            setEditingDomain(domain);
            setEditValue(JSON.stringify(config, null, 2));
            setJsonError("");
        },
        [],
    );

    const handleCancelEdit = useCallback(() => {
        setEditingDomain(null);
        setEditValue("");
        setJsonError("");
    }, []);

    const handleEditChange = useCallback((value: string) => {
        setEditValue(value);
        try {
            JSON.parse(value);
            setJsonError("");
        } catch {
            setJsonError("올바른 JSON 형식이 아닙니다.");
        }
    }, []);

    const handleSave = useCallback(
        (domain: string) => {
            try {
                const config = JSON.parse(editValue) as Record<string, unknown>;
                updateMutation.mutate({ domain, config });
            } catch {
                setJsonError("올바른 JSON 형식이 아닙니다.");
            }
        },
        [editValue, updateMutation],
    );

    const handleCloseSuccess = useCallback(() => {
        setSuccessMessage("");
    }, []);

    return {
        data,
        isLoading,
        error,
        editingDomain,
        editValue,
        jsonError,
        successMessage,
        isSaving: updateMutation.isPending,
        handleStartEdit,
        handleCancelEdit,
        handleEditChange,
        handleSave,
        handleCloseSuccess,
    };
};
