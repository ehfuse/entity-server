import { useGlobalFormaState } from "@ehfuse/forma";
import type { EntityState } from "../models/types/entity";
import * as entityActions from "./entityActions";

/** 엔티티별 독립 데이터 상태 초기값 */
const initialDataState: EntityState = {
    entitiesPage: null,
    selectedEntity: null,
    entityDataPage: null,
    page: 1,
    pageSize: 20,
    isLoading: false,
    error: null,
};

/**
 * 엔티티 데이터 목록 컨트롤러입니다.
 *
 * stateId를 `entityData_${entityName}` 으로 분리하여 엔티티 목록과 상태 충돌 없이 독립 관리합니다.
 *
 * @param entityName 대상 엔티티 이름 (필수)
 */
export const useEntityDataController = (entityName: string) => {
    const state = useGlobalFormaState<EntityState>({
        stateId: `entityData_${entityName}`,
        initialValues: initialDataState,
        actions: {
            fetchEntityData: entityActions.fetchEntityData(),
            createEntityData: entityActions.createEntityData(),
            updateEntityData: entityActions.updateEntityData(),
            deleteEntityData: entityActions.deleteEntityData(),
        },
        watch: {
            // page/pageSize 변경 시 자동 재조회
            page: (context, value) => {
                const { pageSize } = context.getValues();
                entityActions.fetchEntityData()(context, {
                    entityName,
                    page: value,
                    pageSize,
                });
            },
            pageSize: (context, value) => {
                entityActions.fetchEntityData()(context, {
                    entityName,
                    page: 1,
                    pageSize: value,
                });
            },
        },
    });

    const page = state.useValue("page") as EntityState["page"];
    const pageSize = state.useValue("pageSize") as EntityState["pageSize"];

    // page/pageSize setter — watch가 자동으로 fetch 트리거
    const setPage = (newPage: number) => state.setValue("page", newPage + 1);
    const setPageSize = (newSize: number) =>
        state.setValue("pageSize", newSize);

    // MUI TablePagination 핸들러
    const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
    const handleChangeRowsPerPage = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => setPageSize(parseInt(event.target.value, 10));

    const handleDelete = (id: string) => {
        if (window.confirm("데이터를 삭제하시겠습니까?")) {
            state.actions.deleteEntityData({ entityName, id });
        }
    };

    return {
        state,

        // 페이징 (MUI TablePagination 0-based ↔ state 1-based 변환)
        setPage,
        setPageSize,
        handleChangePage,
        handleChangeRowsPerPage,

        // 핸들러
        handleDelete,
        fetchEntityData: () =>
            state.actions.fetchEntityData({ entityName, page, pageSize }),
        createEntityData: (rowData: Record<string, unknown>) =>
            state.actions.createEntityData({ entityName, rowData }),
        updateEntityData: (seq: string, rowData: Record<string, unknown>) =>
            state.actions.updateEntityData({ entityName, seq, rowData }),
    };
};
