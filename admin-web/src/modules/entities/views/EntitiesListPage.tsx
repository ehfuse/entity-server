import { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    Alert,
} from "@mui/material";
import {
    Add as AddIcon,
    MoreVert as MoreVertIcon,
    RestartAlt as ResetIcon,
    Search as SearchIcon,
    SyncAlt as FullReindexIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { entitiesApi } from "../models/api";
import type { Entity } from "../models/types/entity";
import { formatDateTime } from "../../shared/utils/dateTime";
import { useEntityModals } from "../controllers/entityController";
import EntityDialog from "./dialogs/EntityDialog";
import { ConfirmDialog } from "@ehfuse/alerts";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import type { OverlayScrollbarRef } from "@ehfuse/overlay-scrollbar";
import { SearchTextField } from "@ehfuse/mui-form-controls";

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** 스크롤 거리 임계값(px): 이 이상 움직이면 클릭 이벤트를 무시 */
const SCROLL_THRESHOLD = 5;

interface EntityRowMenuState {
    anchor: HTMLElement;
    entity: Entity;
}

const EntitiesListPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchText, setSearchText] = useState("");

    // 스크롤 드래그 vs 클릭 구분용
    const mouseDownScrollTop = useRef<number | null>(null);
    const scrollContainerRef = useRef<OverlayScrollbarRef | null>(null);

    // 행 컨텍스트 메뉴
    const [rowMenu, setRowMenu] = useState<EntityRowMenuState | null>(null);

    const {
        entityDialog,
        dialogEntity,
        openCreateDialog,
        openEditDialog,
        queryClientRef,
    } = useEntityModals();

    useEffect(() => {
        queryClientRef.current = queryClient;
    }, [queryClient, queryClientRef]);

    const { data, isLoading, error } = useQuery({
        queryKey: ["entities"],
        queryFn: () => entitiesApi.getEntities(),
        placeholderData: keepPreviousData,
    });

    // ── 전체 초기화 / 인덱스 재구성 뮤테이션 ──────────────────────────────
    const resetAllMutation = useMutation({
        mutationFn: () => entitiesApi.resetAllEntities(),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    const reindexAllMutation = useMutation({
        mutationFn: () => entitiesApi.reindexAllEntities(),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    // ── 개별 엔티티 액션 뮤테이션 ─────────────────────────────────────────
    const truncateMutation = useMutation({
        mutationFn: (name: string) => entitiesApi.truncateEntity(name),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    const resetMutation = useMutation({
        mutationFn: (name: string) => entitiesApi.resetEntity(name),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    const reindexMutation = useMutation({
        mutationFn: async (name: string) => {
            await entitiesApi.syncEntitySchema(name);
            return entitiesApi.reindexEntity(name);
        },
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (name: string) => entitiesApi.deleteEntity(name),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["entities"] }),
    });

    // ── 필터 ──────────────────────────────────────────────────────────────
    const filteredItems = (data?.items || []).filter(
        (entity: Entity) =>
            !searchText ||
            entity.name.toLowerCase().includes(searchText.toLowerCase()) ||
            (entity.description || "")
                .toLowerCase()
                .includes(searchText.toLowerCase()),
    );

    // ── 행 컨텍스트 메뉴 핸들러 ───────────────────────────────────────────
    const handleMenuOpen = (
        e: React.MouseEvent<HTMLElement>,
        entity: Entity,
    ) => {
        e.stopPropagation();
        setRowMenu({ anchor: e.currentTarget, entity });
    };

    const handleMenuClose = () => setRowMenu(null);

    const handleMenuAction = async (
        action: "view" | "truncate" | "reindex" | "reset" | "delete",
    ) => {
        if (!rowMenu) return;
        const { entity } = rowMenu;
        handleMenuClose();
        switch (action) {
            case "view":
                navigate(`/entities/${entity.name}/data`);
                break;
            case "truncate":
                if (
                    await ConfirmDialog({
                        message: `"${entity.name}" 의 데이터를 전부 비웁니까?`,
                    })
                )
                    truncateMutation.mutate(entity.name);
                break;
            case "reindex":
                if (
                    await ConfirmDialog({
                        message: `"${entity.name}" 인덱스를 재구축합니까? (sync-schema → reindex)`,
                    })
                )
                    reindexMutation.mutate(entity.name);
                break;
            case "reset":
                if (
                    await ConfirmDialog({
                        message: `"${entity.name}" 을 초기화합니까? 모든 데이터가 삭제됩니다.`,
                    })
                )
                    resetMutation.mutate(entity.name);
                break;
            case "delete":
                if (
                    await ConfirmDialog({
                        title: "엔티티 삭제",
                        message: `"${entity.name}" 엔티티를 완전히 삭제합니까?`,
                        confirmText: "삭제",
                    })
                )
                    deleteMutation.mutate(entity.name);
                break;
        }
    };

    // ── 스크롤 중 클릭 방지 ───────────────────────────────────────────────
    const handleRowMouseDown = () => {
        if (scrollContainerRef.current) {
            mouseDownScrollTop.current =
                scrollContainerRef.current.getScrollContainer()?.scrollTop ??
                null;
        } else {
            mouseDownScrollTop.current = null;
        }
    };

    const handleRowClick = (entity: Entity) => {
        const scrollEl = scrollContainerRef.current?.getScrollContainer();
        if (scrollEl && mouseDownScrollTop.current !== null) {
            const delta = Math.abs(
                scrollEl.scrollTop - mouseDownScrollTop.current,
            );
            if (delta > SCROLL_THRESHOLD) return;
        }
        openEditDialog(entity);
    };

    if (error) {
        return (
            <Alert severity="error">
                데이터를 불러오는 중 오류가 발생했습니다.
            </Alert>
        );
    }

    const isBusy =
        resetAllMutation.isPending ||
        reindexAllMutation.isPending ||
        truncateMutation.isPending ||
        resetMutation.isPending ||
        reindexMutation.isPending ||
        deleteMutation.isPending;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Paper
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "100%",
                    overflow: "hidden",
                }}
            >
                <OverlayScrollbar
                    style={{ flex: 1, minHeight: 0 }}
                    ref={scrollContainerRef}
                    track={{ alignment: "outside" }}
                >
                    <TableContainer sx={{ overflow: "visible" }}>
                        <Table stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>
                                        <strong>이름</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>설명</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>인덱스 필드</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>레코드</strong>
                                    </TableCell>
                                    <TableCell align="right">
                                        <strong>크기</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>생성일시</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>작업</strong>
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">
                                            <CircularProgress />
                                        </TableCell>
                                    </TableRow>
                                ) : data?.items?.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            align="center"
                                            sx={{ py: 10 }}
                                        >
                                            데이터가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems.map(
                                        (entity: Entity, index: number) => (
                                            <TableRow
                                                key={`${entity.id || entity.name}-${index}`}
                                                hover
                                                onMouseDown={handleRowMouseDown}
                                                onClick={() =>
                                                    handleRowClick(entity)
                                                }
                                                sx={{ cursor: "pointer" }}
                                            >
                                                <TableCell>
                                                    <strong>
                                                        {entity.name}
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    {entity.description}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {entity.fields?.length || 0}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {entity.table_summary ? (
                                                        <Tooltip
                                                            arrow
                                                            title={
                                                                entity
                                                                    .table_summary
                                                                    .deleted_records >
                                                                0
                                                                    ? `삭제됨: ${entity.table_summary.deleted_records.toLocaleString()}`
                                                                    : ""
                                                            }
                                                        >
                                                            <Typography variant="body2">
                                                                {entity.table_summary.total_records.toLocaleString()}
                                                                {entity
                                                                    .table_summary
                                                                    .deleted_records >
                                                                    0 && (
                                                                    <Typography
                                                                        component="span"
                                                                        variant="caption"
                                                                        color="text.secondary"
                                                                        sx={{
                                                                            ml: 0.5,
                                                                        }}
                                                                    >
                                                                        (
                                                                        {entity.table_summary.deleted_records.toLocaleString()}{" "}
                                                                        삭제)
                                                                    </Typography>
                                                                )}
                                                            </Typography>
                                                        </Tooltip>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    {entity.table_summary ? (
                                                        <Tooltip
                                                            arrow
                                                            title={
                                                                <Box>
                                                                    <div>
                                                                        데이터:{" "}
                                                                        {formatBytes(
                                                                            entity
                                                                                .table_summary
                                                                                .data_size_bytes,
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        인덱스:{" "}
                                                                        {formatBytes(
                                                                            entity
                                                                                .table_summary
                                                                                .index_size_bytes,
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        히스토리:{" "}
                                                                        {formatBytes(
                                                                            entity
                                                                                .table_summary
                                                                                .history_size_bytes,
                                                                        )}
                                                                    </div>
                                                                </Box>
                                                            }
                                                        >
                                                            <Typography
                                                                variant="body2"
                                                                sx={{
                                                                    cursor: "default",
                                                                }}
                                                            >
                                                                {formatBytes(
                                                                    entity
                                                                        .table_summary
                                                                        .total_size_bytes,
                                                                )}
                                                            </Typography>
                                                        </Tooltip>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {formatDateTime(
                                                        entity.created_time,
                                                    )}
                                                </TableCell>
                                                <TableCell
                                                    align="center"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <IconButton
                                                        size="small"
                                                        color="primary"
                                                        onClick={() =>
                                                            navigate(
                                                                `/entities/${entity.name}/data`,
                                                            )
                                                        }
                                                        title="데이터"
                                                    >
                                                        <SearchIcon />
                                                    </IconButton>
                                                    <Tooltip title="메뉴" arrow>
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMenuOpen(
                                                                    e,
                                                                    entity,
                                                                );
                                                            }}
                                                        >
                                                            <MoreVertIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        ),
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </OverlayScrollbar>

                {/* ── 하단 툴바 ──────────────────────────────────────────── */}
                <Box
                    sx={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 2,
                        "&::before": {
                            content: '""',
                            position: "absolute",
                            top: -1,
                            left: 0,
                            right: 0,
                            height: "1px",
                            backgroundColor: "#e0e0e0",
                        },
                    }}
                >
                    <SearchTextField
                        size="small"
                        placeholder="엔티티 검색..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        sx={{ width: 300 }}
                    />
                    <Box sx={{ display: "flex", gap: 3 }}>
                        <Button
                            color="inherit"
                            size="large"
                            startIcon={<ResetIcon />}
                            disabled={isBusy}
                            onClick={async () => {
                                if (
                                    await ConfirmDialog({
                                        title: "전체 초기화",
                                        message:
                                            "모든 엔티티를 초기화합니까? 전체 데이터가 삭제됩니다.",
                                        confirmText: "초기화",
                                    })
                                )
                                    resetAllMutation.mutate();
                            }}
                        >
                            전체 초기화
                        </Button>
                        <Button
                            color="inherit"
                            size="large"
                            startIcon={<FullReindexIcon />}
                            disabled={isBusy}
                            onClick={async () => {
                                if (
                                    await ConfirmDialog({
                                        message:
                                            "전체 엔티티 인덱스를 재구성합니까?",
                                    })
                                )
                                    reindexAllMutation.mutate();
                            }}
                        >
                            전체 인덱스 재구성
                        </Button>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<AddIcon />}
                            onClick={openCreateDialog}
                        >
                            추가
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* ── 행 컨텍스트 메뉴 ─────────────────────────────────────── */}
            <Menu
                anchorEl={rowMenu?.anchor}
                open={Boolean(rowMenu)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { minWidth: 200 } } }}
            >
                <Box
                    sx={{
                        px: 2,
                        py: 1,
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <Typography
                        variant="body2"
                        fontWeight="bold"
                        color="text.primary"
                    >
                        {rowMenu?.entity.name}
                    </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <MenuItem onClick={() => handleMenuAction("truncate")}>
                    <ListItemText>비우기</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleMenuAction("reindex")}>
                    <ListItemText>인덱스 재구축</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleMenuAction("reset")}>
                    <ListItemText>초기화</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => handleMenuAction("delete")}>
                    <ListItemText sx={{ color: "error.main" }}>
                        삭제
                    </ListItemText>
                </MenuItem>
            </Menu>

            <EntityDialog
                open={entityDialog.isOpen}
                onClose={entityDialog.close}
                entity={dialogEntity}
                existingNames={(data?.items || []).map((e: Entity) => e.name)}
            />
        </Box>
    );
};

export default EntitiesListPage;
