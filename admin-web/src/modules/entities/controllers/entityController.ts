import { useNavigate } from "react-router-dom";
import { useGlobalFormaState, useModal } from "@ehfuse/forma";
import type { EntityState } from "../models/types/entity";
import type { Entity } from "../models/types/entity";
import { useRef, useState } from "react";
import * as entityActions from "./entityActions";

const initialState: EntityState = {
    entitiesPage: null,
    selectedEntity: null,
    entityDataPage: null,
    page: 1,
    pageSize: 20,
    isLoading: false,
    error: null,
};

/**
 * 엔티티 목록 다이얼로그/모달 전용 훅 (fetch 없음, EntitiesListPage에서 사용)
 * useQuery(TanStack Query)로만 데이터를 가져오므로 Forma fetch 없이 모달 기능만 담당합니다.
 */
export const useEntityModals = () => {
    const queryClientRef = useRef<{
        invalidateQueries: (opts: { queryKey: unknown[] }) => void;
    } | null>(null);

    const [dialogEntity, setDialogEntity] = useState<Entity | null>(null);

    const entityDialog = useModal({
        modalId: "entityDialog",
        onClose: () => {
            setDialogEntity(null);
            queryClientRef.current?.invalidateQueries({
                queryKey: ["entities"],
            });
        },
    });

    const openCreateDialog = () => {
        setDialogEntity(null);
        entityDialog.open();
    };

    const openEditDialog = (entity: Entity) => {
        setDialogEntity(entity);
        entityDialog.open();
    };

    return {
        entityDialog,
        dialogEntity,
        openCreateDialog,
        openEditDialog,
        queryClientRef,
    };
};

/**
 * 엔티티 목록/생성/수정 컨트롤러입니다.
 * (EntityDataPage 등 Forma 상태가 필요한 페이지에서 사용)
 */
export const useEntityController = () => {
    const navigate = useNavigate();

    const state = useGlobalFormaState<EntityState>({
        stateId: "entities",
        initialValues: initialState,
        actions: {
            fetchEntities: entityActions.fetchEntities(),
            fetchEntity: entityActions.fetchEntity(),
            createEntity: entityActions.createEntity(),
            updateEntity: entityActions.updateEntity(),
            deleteEntity: entityActions.deleteEntity(),
        },
    });

    const setPage = (newPage: number) => state.setValue("page", newPage + 1);
    const setPageSize = (newSize: number) =>
        state.setValue("pageSize", newSize);

    const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);

    const handleChangeRowsPerPage = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => setPageSize(parseInt(event.target.value, 10));

    const handleDeleteEntity = (name: string) => {
        if (window.confirm(`${name} 엔티티를 삭제하시겠습니까?`)) {
            state.actions.deleteEntity(name);
        }
    };

    return {
        state,
        setPage,
        setPageSize,
        handleChangePage,
        handleChangeRowsPerPage,
        handleDeleteEntity,
        navigateToData: (name: string) => navigate(`/entities/${name}/data`),
        navigateToDetail: (name: string) => navigate(`/entities/${name}`),
    };
};
