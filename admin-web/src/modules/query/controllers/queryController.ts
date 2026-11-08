import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryApi } from "../models/api";
import type {
    QueryRequestPayload,
    QueryResultData,
    QueryState,
} from "../models/types/query";

const DEFAULT_SQL = "SELECT * FROM account LIMIT 20";

const buildTemplateSql = (entityName: string, limitText: string) => {
    const name = entityName.trim();
    if (!name) {
        return DEFAULT_SQL;
    }

    const parsedLimit = Number(limitText.trim());
    const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.floor(parsedLimit)
            : 20;
    return `SELECT * FROM ${name} LIMIT ${limit}`;
};

export const useQueryController = () => {
    const [state, setState] = useState<QueryState>({
        entityName: "",
        sql: DEFAULT_SQL,
        paramsText: "[]",
        limitText: "20",
    });
    const [formError, setFormError] = useState<string>("");

    const entitiesQuery = useQuery({
        queryKey: ["query-editor-entities"],
        queryFn: () => queryApi.getEntities(),
    });

    const executeMutation = useMutation({
        mutationFn: ({
            entityName,
            payload,
        }: {
            entityName: string;
            payload: QueryRequestPayload;
        }) => queryApi.executeEntityQuery(entityName, payload),
    });

    const entityOptions = useMemo(
        () =>
            (entitiesQuery.data ?? [])
                .map((entity) => entity.name)
                .sort((a, b) => a.localeCompare(b)),
        [entitiesQuery.data],
    );

    const update = (patch: Partial<QueryState>) => {
        setState((prev) => ({ ...prev, ...patch }));
    };

    const updateEntityName = (entityName: string) => {
        setState((prev) => ({
            ...prev,
            entityName,
            sql: buildTemplateSql(entityName, prev.limitText),
        }));
    };

    const updateLimitText = (limitText: string) => {
        setState((prev) => ({
            ...prev,
            limitText,
            sql: buildTemplateSql(prev.entityName, limitText),
        }));
    };

    const runQuery = async () => {
        setFormError("");

        const entityName = state.entityName.trim();
        if (!entityName) {
            setFormError("엔티티를 선택해주세요.");
            return;
        }

        const sql = state.sql.trim();
        if (!sql) {
            setFormError("SQL을 입력해주세요.");
            return;
        }

        let parsedParams: unknown[] | undefined;
        const paramsText = state.paramsText.trim();
        if (paramsText) {
            try {
                const parsed = JSON.parse(paramsText) as unknown;
                if (!Array.isArray(parsed)) {
                    setFormError("params는 JSON 배열이어야 합니다.");
                    return;
                }
                parsedParams = parsed;
            } catch {
                setFormError("params JSON 형식이 올바르지 않습니다.");
                return;
            }
        }

        let parsedLimit: number | undefined;
        const limitText = state.limitText.trim();
        if (limitText) {
            const value = Number(limitText);
            if (!Number.isFinite(value) || value <= 0) {
                setFormError("limit은 1 이상의 숫자여야 합니다.");
                return;
            }
            parsedLimit = Math.floor(value);
        }

        await executeMutation.mutateAsync({
            entityName,
            payload: {
                sql,
                params: parsedParams,
                limit: parsedLimit,
            },
        });
    };

    const result: QueryResultData = executeMutation.data ?? {
        items: [],
        count: 0,
    };

    return {
        state,
        update,
        updateEntityName,
        updateLimitText,
        runQuery,
        entityOptions,
        entitiesLoading: entitiesQuery.isLoading,
        entitiesError: entitiesQuery.error as Error | null,
        executeLoading: executeMutation.isPending,
        executeError: executeMutation.error as Error | null,
        formError,
        result,
    };
};
