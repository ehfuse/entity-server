import { useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    Menu,
    MenuItem,
    ListItemText,
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
    MoreVert as MoreVertIcon,
    Refresh as RefreshIcon,
    Security as SecurityIcon,
} from "@mui/icons-material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import type { OverlayScrollbarRef } from "@ehfuse/overlay-scrollbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@ehfuse/alerts";
import { rolesApi } from "../models/api";
import { useRoleModals } from "../controllers/roleController";
import RoleDialog from "./dialogs/RoleDialog";
import type { RbacRole } from "../models/types/role";

const SCROLL_THRESHOLD = 5;

/** permissions 파싱 (string | string[] → string[]) */
const parsePermissions = (raw: string | string[] | undefined): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

interface RoleRowMenuState {
    anchor: HTMLElement;
    role: RbacRole;
}

const RolesListPage = () => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const mouseDownScrollTop = useRef<number | null>(null);
    const scrollContainerRef = useRef<OverlayScrollbarRef | null>(null);
    const [rowMenu, setRowMenu] = useState<RoleRowMenuState | null>(null);

    const { roleDialog, dialogRole, openCreateDialog, openEditDialog } =
        useRoleModals();

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["roles", page, pageSize],
        queryFn: () =>
            rolesApi.getRoles({ page: page + 1, page_size: pageSize }),
    });

    const deleteMutation = useMutation({
        mutationFn: (seq: number) => rolesApi.deleteRole(seq),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles"] }),
    });

    const handleDelete = async (role: RbacRole) => {
        const confirmed = await ConfirmDialog({
            message: `역할 "${role.name}"을(를) 삭제하시겠습니까?`,
            confirmText: "삭제",
        });
        if (confirmed) deleteMutation.mutate(role.seq);
    };

    const handleMenuOpen = (
        e: React.MouseEvent<HTMLElement>,
        role: RbacRole,
    ) => {
        e.stopPropagation();
        setRowMenu({ anchor: e.currentTarget, role });
    };

    const handleMenuClose = () => setRowMenu(null);

    const handleMenuAction = async (action: "edit" | "delete") => {
        if (!rowMenu) return;
        const { role } = rowMenu;
        handleMenuClose();
        if (action === "edit") {
            openEditDialog(role);
        } else {
            await handleDelete(role);
        }
    };

    const handleRowMouseDown = () => {
        mouseDownScrollTop.current =
            scrollContainerRef.current?.getScrollContainer()?.scrollTop ?? null;
    };

    const handleRowClick = (role: RbacRole) => {
        const scrollEl = scrollContainerRef.current?.getScrollContainer();
        if (scrollEl && mouseDownScrollTop.current !== null) {
            if (
                Math.abs(scrollEl.scrollTop - mouseDownScrollTop.current) >
                SCROLL_THRESHOLD
            )
                return;
        }
        openEditDialog(role);
    };

    const roles: RbacRole[] = data?.items ?? [];

    if (error) {
        return (
            <Alert severity="error">
                역할 목록을 불러오지 못했습니다: {(error as Error).message}
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
                    <SecurityIcon color="primary" sx={{ mr: 0.5 }} />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        권한 관리
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
                        역할 추가
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
                                    <TableCell sx={{ width: "18%" }}>
                                        <strong>역할 이름</strong>
                                    </TableCell>
                                    <TableCell sx={{ width: "25%" }}>
                                        <strong>설명</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>권한 목록</strong>
                                    </TableCell>
                                    <TableCell
                                        align="center"
                                        sx={{ width: "80px" }}
                                    >
                                        <strong>작업</strong>
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : roles.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            align="center"
                                            sx={{ color: "text.secondary" }}
                                        >
                                            역할이 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    roles.map((role) => (
                                        <TableRow
                                            key={role.seq}
                                            hover
                                            sx={{ cursor: "pointer" }}
                                            onMouseDown={handleRowMouseDown}
                                            onClick={() => handleRowClick(role)}
                                        >
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: "D2Coding",
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {role.name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "text.secondary",
                                                    }}
                                                >
                                                    {role.description || "-"}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        flexWrap: "wrap",
                                                        gap: 0.5,
                                                    }}
                                                >
                                                    {parsePermissions(
                                                        role.permissions,
                                                    ).map((perm) => (
                                                        <Chip
                                                            key={perm}
                                                            label={perm}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{
                                                                fontFamily:
                                                                    "D2Coding",
                                                                fontSize:
                                                                    "0.7rem",
                                                            }}
                                                        />
                                                    ))}
                                                </Box>
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Tooltip title="더보기">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) =>
                                                            handleMenuOpen(
                                                                e,
                                                                role,
                                                            )
                                                        }
                                                    >
                                                        <MoreVertIcon fontSize="small" />
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

            {/* MoreVert 메뉴 */}
            <Menu
                anchorEl={rowMenu?.anchor}
                open={!!rowMenu}
                onClose={handleMenuClose}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={() => handleMenuAction("edit")}>
                    <ListItemText>수정</ListItemText>
                </MenuItem>
                <MenuItem
                    onClick={() => handleMenuAction("delete")}
                    sx={{ color: "error.main" }}
                >
                    <ListItemText>삭제</ListItemText>
                </MenuItem>
            </Menu>

            {/* RoleDialog */}
            <RoleDialog
                key={
                    roleDialog.isOpen
                        ? (dialogRole?.seq ?? "new-role")
                        : undefined
                }
                open={roleDialog.isOpen}
                onClose={roleDialog.close}
                role={dialogRole}
            />
        </Box>
    );
};

export default RolesListPage;
