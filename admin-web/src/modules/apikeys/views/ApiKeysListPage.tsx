import { useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    Paper,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    DeleteOutline as DeleteOutlineIcon,
    Refresh as RefreshIcon,
    Key as KeyIcon,
} from "@mui/icons-material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import type { OverlayScrollbarRef } from "@ehfuse/overlay-scrollbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@ehfuse/alerts";
import { apiKeysApi } from "../models/api";
import { useApiKeyModals } from "../controllers/apiKeyController";
import ApiKeyDialog from "./dialogs/ApiKeyDialog";
import type { ApiKey } from "../models/types/apiKey";

const SCROLL_THRESHOLD = 5;

const ApiKeysListPage = () => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const mouseDownScrollTop = useRef<number | null>(null);
    const scrollContainerRef = useRef<OverlayScrollbarRef | null>(null);

    const { apiKeyDialog, dialogApiKey, openCreateDialog, openEditDialog } =
        useApiKeyModals();

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["api-keys", page, pageSize],
        queryFn: () =>
            apiKeysApi.getApiKeys({ page: page + 1, page_size: pageSize }),
    });

    const toggleEnabledMutation = useMutation({
        mutationFn: ({ seq, enabled }: { seq: number; enabled: boolean }) =>
            apiKeysApi.updateApiKey(seq, { enabled }),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (seq: number) => apiKeysApi.deleteApiKey(seq),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
    });

    const handleDelete = async (apiKey: ApiKey) => {
        const confirmed = await ConfirmDialog({
            message: `API 키 "${apiKey.key_value}"을(를) 삭제하시겠습니까?`,
            confirmText: "삭제",
        });
        if (confirmed) deleteMutation.mutate(apiKey.seq);
    };

    const handleRowMouseDown = () => {
        mouseDownScrollTop.current =
            scrollContainerRef.current?.getScrollContainer()?.scrollTop ?? null;
    };

    const handleRowClick = (apiKey: ApiKey) => {
        const scrollEl = scrollContainerRef.current?.getScrollContainer();
        if (scrollEl && mouseDownScrollTop.current !== null) {
            if (
                Math.abs(scrollEl.scrollTop - mouseDownScrollTop.current) >
                SCROLL_THRESHOLD
            )
                return;
        }
        openEditDialog(apiKey);
    };

    const apiKeys: ApiKey[] = data?.items ?? [];

    if (error) {
        return (
            <Alert severity="error">
                API 키 목록을 불러오지 못했습니다: {(error as Error).message}
            </Alert>
        );
    }

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
                {/* 헤더 */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        px: 3,
                        py: 2,
                        gap: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    <KeyIcon color="primary" sx={{ mr: 0.5 }} />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        API 키 관리
                    </Typography>
                    <Tooltip title="새로고침">
                        <IconButton
                            size="small"
                            onClick={() => refetch()}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <CircularProgress size={18} />
                            ) : (
                                <RefreshIcon />
                            )}
                        </IconButton>
                    </Tooltip>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={openCreateDialog}
                    >
                        API 키 추가
                    </Button>
                </Box>

                {/* 테이블 */}
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
                                        <strong>API Key</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>역할</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>설명</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>활성</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>작업</strong>
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center">
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : apiKeys.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            align="center"
                                            sx={{ color: "text.secondary" }}
                                        >
                                            API 키가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    apiKeys.map((ak) => (
                                        <TableRow
                                            key={ak.seq}
                                            hover
                                            sx={{ cursor: "pointer" }}
                                            onMouseDown={handleRowMouseDown}
                                            onClick={() => handleRowClick(ak)}
                                        >
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: "D2Coding",
                                                        fontWeight: 600,
                                                        letterSpacing: "0.05em",
                                                    }}
                                                >
                                                    {ak.key_value}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={ak.role}
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                    sx={{
                                                        fontFamily: "D2Coding",
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "text.secondary",
                                                    }}
                                                >
                                                    {ak.description || "-"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Switch
                                                    checked={ak.enabled}
                                                    size="small"
                                                    onChange={(e) =>
                                                        toggleEnabledMutation.mutate(
                                                            {
                                                                seq: ak.seq,
                                                                enabled:
                                                                    e.target
                                                                        .checked,
                                                            },
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Tooltip title="삭제">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() =>
                                                            void handleDelete(
                                                                ak,
                                                            )
                                                        }
                                                    >
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </OverlayScrollbar>

                {/* 페이지네이션 */}
                <TablePagination
                    component="div"
                    count={data?.total ?? 0}
                    page={page}
                    rowsPerPage={pageSize}
                    rowsPerPageOptions={[10, 20, 50]}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                        setPageSize(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                />
            </Paper>

            {/* ApiKeyDialog */}
            <ApiKeyDialog
                key={
                    apiKeyDialog.isOpen
                        ? (dialogApiKey?.seq ?? "new-apikey")
                        : undefined
                }
                open={apiKeyDialog.isOpen}
                onClose={apiKeyDialog.close}
                apiKey={dialogApiKey}
            />
        </Box>
    );
};

export default ApiKeysListPage;
