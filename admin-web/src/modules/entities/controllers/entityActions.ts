import type { ActionContext } from "@ehfuse/forma";
import type { EntityState } from "../models/types/entity";
import { entitiesApi } from "../models/api";
import type { Entity } from "../models/types/entity";

// 엔티티 목록을 조회하고 상태에 반영합니다.
export const fetchEntities =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: { page: number; pageSize: number },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            const data = await entitiesApi.getEntities();
            context.setValues({
                entitiesPage: data,
                page: payload.page,
                pageSize: payload.pageSize,
                isLoading: false,
            });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 목록 조회 실패",
            });
        }
    };

// 단일 엔티티 상세를 조회하고 상태에 반영합니다.
export const fetchEntity =
    () => async (context: ActionContext<EntityState>, name: string) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            const res = await entitiesApi.getEntity(name);
            context.setValues({
                selectedEntity: res.data || null,
                isLoading: false,
            });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 조회 실패",
            });
        }
    };

// 엔티티를 생성하고 목록을 갱신합니다.
export const createEntity =
    () =>
    async (context: ActionContext<EntityState>, entity: Partial<Entity>) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.createEntity(entity);
            const data = await entitiesApi.getEntities();
            context.setValues({ entitiesPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 생성 실패",
            });
        }
    };

// 엔티티를 수정하고 목록을 갱신합니다.
export const updateEntity =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: { name: string; entity: Partial<Entity> },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.updateEntity(payload.name, payload.entity);
            const data = await entitiesApi.getEntities();
            context.setValues({ entitiesPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 수정 실패",
            });
        }
    };

// 엔티티를 삭제하고 목록을 갱신합니다.
export const deleteEntity =
    () => async (context: ActionContext<EntityState>, name: string) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.deleteEntity(name);
            const data = await entitiesApi.getEntities();
            context.setValues({ entitiesPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 삭제 실패",
            });
        }
    };

// 엔티티 데이터 목록을 조회하고 상태에 반영합니다.
export const fetchEntityData =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: { entityName: string; page: number; pageSize: number },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            const data = await entitiesApi.getEntityData(
                payload.entityName,
                payload.page,
                payload.pageSize,
            );
            context.setValues({
                entityDataPage: data,
                page: payload.page,
                pageSize: payload.pageSize,
                isLoading: false,
            });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "엔티티 데이터 조회 실패",
            });
        }
    };

// 엔티티 데이터를 생성하고 목록을 갱신합니다.
export const createEntityData =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: { entityName: string; rowData: Record<string, unknown> },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.createEntityData(
                payload.entityName,
                payload.rowData,
            );
            const { page, pageSize } = context.getValues();
            const data = await entitiesApi.getEntityData(
                payload.entityName,
                page,
                pageSize,
            );
            context.setValues({ entityDataPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "데이터 생성 실패",
            });
        }
    };

// 엔티티 데이터를 수정하고 목록을 갱신합니다.
export const updateEntityData =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: {
            entityName: string;
            seq: string;
            rowData: Record<string, unknown>;
        },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.updateEntityData(
                payload.entityName,
                payload.seq,
                payload.rowData,
            );
            const { page, pageSize } = context.getValues();
            const data = await entitiesApi.getEntityData(
                payload.entityName,
                page,
                pageSize,
            );
            context.setValues({ entityDataPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "데이터 수정 실패",
            });
        }
    };

// 엔티티 데이터를 삭제하고 목록을 갱신합니다.
export const deleteEntityData =
    () =>
    async (
        context: ActionContext<EntityState>,
        payload: { entityName: string; id: string },
    ) => {
        context.setValue("isLoading", true);
        context.setValue("error", null);
        try {
            await entitiesApi.deleteEntityData(payload.entityName, payload.id);
            const { page, pageSize } = context.getValues();
            const data = await entitiesApi.getEntityData(
                payload.entityName,
                page,
                pageSize,
            );
            context.setValues({ entityDataPage: data, isLoading: false });
        } catch (e) {
            const err = e as Error;
            context.setValues({
                isLoading: false,
                error: err.message || "데이터 삭제 실패",
            });
        }
    };
