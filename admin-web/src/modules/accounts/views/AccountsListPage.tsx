import { useRef, useState, type ChangeEvent } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    Paper,
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
} from "@mui/icons-material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import type { OverlayScrollbarRef } from "@ehfuse/overlay-scrollbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@ehfuse/alerts";
import { SearchTextField } from "@ehfuse/mui-form-controls";
import { accountsApi } from "../models/api";
import { useAccountModals } from "../controllers/accountController";
import AccountDialog from "./dialogs/AccountDialog";
import { formatDateTime } from "../../shared/utils/dateTime";
import type { Account } from "../models/types/account";

const ROLE_COLORS: Record<
    string,
    "error" | "warning" | "info" | "success" | "default"
> = {
    admin: "error",
    editor: "warning",
    viewer: "info",
    auditor: "success",
    user: "default",
};

const STATUS_COLORS: Record<
    string,
    "success" | "warning" | "error" | "default"
> = {
    active: "success",
    inactive: "warning",
    blocked: "error",
};

const SCROLL_THRESHOLD = 5;

const AccountsListPage = () => {
    const queryClient = useQueryClient();
    const [searchText, setSearchText] = useState("");
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const mouseDownScrollTop = useRef<number | null>(null);
    const scrollContainerRef = useRef<OverlayScrollbarRef | null>(null);

    const { accountDialog, dialogAccount, openCreateDialog, openEditDialog } =
        useAccountModals();

    // 검색어 디바운스
    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchText(value);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setDebouncedSearch(value);
            setPage(0);
        }, 350);
    };

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["accounts", page, pageSize, debouncedSearch],
        queryFn: () =>
            accountsApi.getUsers({
                page: page + 1,
                page_size: pageSize,
                ...(debouncedSearch ? { search: debouncedSearch } : {}),
            }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => accountsApi.deleteAccount(id),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    });

    const handleDelete = async (user: Account) => {
        const confirmed = await ConfirmDialog({
            message: `계정 "${user.email}"을(를) 삭제하시겠습니까?`,
            confirmText: "삭제",
        });
        if (confirmed) {
            deleteMutation.mutate(user.id);
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

    const handleRowClick = (user: Account) => {
        const scrollEl = scrollContainerRef.current?.getScrollContainer();
        if (scrollEl && mouseDownScrollTop.current !== null) {
            const delta = Math.abs(
                scrollEl.scrollTop - mouseDownScrollTop.current,
            );
            if (delta > SCROLL_THRESHOLD) return;
        }
        openEditDialog(user);
    };

    const users: Account[] = data?.items ?? [];

    if (error) {
        return (
            <Alert severity="error">
                계정 목록을 불러오지 못했습니다: {(error as Error).message}
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
                                        <strong>이메일</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>RBAC 역할</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>상태</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>마지막 로그인</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>생성일</strong>
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
                                ) : users.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            align="center"
                                            sx={{ py: 10 }}
                                        >
                                            계정이 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((user) => (
                                        <TableRow
                                            key={user.id}
                                            hover
                                            onMouseDown={handleRowMouseDown}
                                            onClick={() => handleRowClick(user)}
                                            sx={{ cursor: "pointer" }}
                                        >
                                            <TableCell
                                                sx={{
                                                    fontFamily: "D2Coding",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {user.email}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={user.rbac_role}
                                                    size="small"
                                                    color={
                                                        ROLE_COLORS[
                                                            user.rbac_role ?? ""
                                                        ] ?? "default"
                                                    }
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    size="small"
                                                    label={user.status ?? "-"}
                                                    color={
                                                        STATUS_COLORS[
                                                            user.status ?? ""
                                                        ] ?? "default"
                                                    }
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    color: "text.secondary",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {user.last_login_time
                                                    ? formatDateTime(
                                                          user.last_login_time,
                                                      )
                                                    : "-"}
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    color: "text.secondary",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {user.created_time
                                                    ? formatDateTime(
                                                          user.created_time,
                                                      )
                                                    : "-"}
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Tooltip title="삭제" arrow>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() =>
                                                            void handleDelete(
                                                                user,
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

                {/* ── 페이지네이션 ──────────────────────────────────────── */}
                <TablePagination
                    component="div"
                    count={data?.total ?? 0}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={pageSize}
                    onRowsPerPageChange={(e) => {
                        setPageSize(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                    rowsPerPageOptions={[10, 20, 50, 100]}
                    labelRowsPerPage="페이지당"
                />

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
                        placeholder="이메일 검색..."
                        value={searchText}
                        onChange={handleSearchChange}
                        sx={{ width: 300 }}
                    />
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        <Tooltip title="새로고침">
                            <IconButton onClick={() => refetch()} size="small">
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<AddIcon />}
                            onClick={openCreateDialog}
                        >
                            계정 추가
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* 다이얼로그 */}
            <AccountDialog
                key={dialogAccount?.id ?? "new"}
                open={accountDialog.isOpen}
                onClose={accountDialog.close}
                user={dialogAccount}
            />
        </Box>
    );
};

export default AccountsListPage;
