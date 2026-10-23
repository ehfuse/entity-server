import { useRef, useState } from "react";
import {
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
    Alert,
} from "@mui/material";
import {
    Add as AddIcon,
    DeleteOutline as DeleteOutlineIcon,
    PeopleOutline as PeopleOutlineIcon,
    Refresh as RefreshIcon,
} from "@mui/icons-material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import type { OverlayScrollbarRef } from "@ehfuse/overlay-scrollbar";
import { SearchTextField } from "@ehfuse/mui-form-controls";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@ehfuse/alerts";
import { useNavigate } from "react-router-dom";
import { licensesApi } from "../models/api";
import { useLicenseModals } from "../controllers/licenseController";
import LicenseDialog from "./dialogs/LicenseDialog";
import { formatDateTime } from "../../shared/utils/dateTime";
import type { License, LicenseStatus } from "../models/types/license";

const STATUS_COLORS: Record<
    LicenseStatus,
    "success" | "warning" | "error" | "default"
> = {
    active: "success",
    pending: "warning",
    suspended: "error",
    expired: "default",
};

const STATUS_LABELS: Record<LicenseStatus, string> = {
    active: "활성",
    pending: "대기",
    suspended: "정지",
    expired: "만료",
};

const SCROLL_THRESHOLD = 5;

const LicensesListPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [searchText, setSearchText] = useState("");
    const mouseDownScrollTop = useRef<number | null>(null);
    const scrollContainerRef = useRef<OverlayScrollbarRef | null>(null);

    const { licenseDialog, dialogLicense, openCreateDialog, openEditDialog } =
        useLicenseModals();

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["licenses", page, pageSize],
        queryFn: () =>
            licensesApi.getLicenses({ page: page + 1, page_size: pageSize }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => licensesApi.deleteLicense(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["licenses"] });
        },
    });

    const handleDelete = async (lic: License) => {
        const confirmed = await ConfirmDialog({
            message: `라이선스 "${lic.key}"를 삭제하시겠습니까?`,
            confirmText: "삭제",
        });
        if (confirmed) {
            deleteMutation.mutate(lic.id);
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

    const handleRowClick = (license: License) => {
        const scrollEl = scrollContainerRef.current?.getScrollContainer();
        if (scrollEl && mouseDownScrollTop.current !== null) {
            const delta = Math.abs(
                scrollEl.scrollTop - mouseDownScrollTop.current,
            );
            if (delta > SCROLL_THRESHOLD) return;
        }
        openEditDialog(license);
    };

    // ── 검색 필터 (클라이언트 사이드) ────────────────────────────────────
    const licenses: License[] = (data?.items ?? []).filter(
        (lic: License) =>
            !searchText ||
            lic.key.toLowerCase().includes(searchText.toLowerCase()) ||
            (lic.description ?? "")
                .toLowerCase()
                .includes(searchText.toLowerCase()),
    );

    if (error) {
        return (
            <Alert severity="error">
                라이선스 목록을 불러오지 못했습니다: {(error as Error).message}
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
                                        <strong>이름</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>키</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>설명</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>범위</strong>
                                    </TableCell>
                                    <TableCell>
                                        <strong>상태</strong>
                                    </TableCell>
                                    <TableCell align="right">
                                        <strong>최대 레코드</strong>
                                    </TableCell>
                                    <TableCell align="center">
                                        <strong>만료일</strong>
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
                                        <TableCell colSpan={9} align="center">
                                            <CircularProgress />
                                        </TableCell>
                                    </TableRow>
                                ) : licenses.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={9}
                                            align="center"
                                            sx={{ py: 10 }}
                                        >
                                            라이선스가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    licenses.map((lic) => (
                                        <TableRow
                                            key={lic.id}
                                            hover
                                            onMouseDown={handleRowMouseDown}
                                            onClick={() => handleRowClick(lic)}
                                            sx={{ cursor: "pointer" }}
                                        >
                                            <TableCell sx={{ fontWeight: 500 }}>
                                                {lic.name ?? "-"}
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    fontFamily: "D2Coding",
                                                    fontWeight: 600,
                                                    maxWidth: 200,
                                                }}
                                            >
                                                <Tooltip title={lic.key}>
                                                    <span
                                                        style={{
                                                            cursor: "default",
                                                        }}
                                                    >
                                                        {lic.key
                                                            ? lic.key.length >
                                                              24
                                                                ? `${lic.key.slice(0, 24)}…`
                                                                : lic.key
                                                            : "-"}
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                {lic.description ?? "-"}
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={lic.scope}
                                                    size="small"
                                                    color={
                                                        lic.scope === "global"
                                                            ? "primary"
                                                            : "info"
                                                    }
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={
                                                        STATUS_LABELS[
                                                            lic.status
                                                        ]
                                                    }
                                                    size="small"
                                                    color={
                                                        STATUS_COLORS[
                                                            lic.status
                                                        ]
                                                    }
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                {lic.max_records != null
                                                    ? lic.max_records.toLocaleString()
                                                    : "무제한"}
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    color: "text.secondary",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {lic.expires_at
                                                    ? formatDateTime(
                                                          lic.expires_at,
                                                      )
                                                    : "없음"}
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                sx={{
                                                    color: "text.secondary",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {lic.created_at
                                                    ? formatDateTime(
                                                          lic.created_at,
                                                      )
                                                    : "-"}
                                            </TableCell>
                                            <TableCell
                                                align="center"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Tooltip
                                                    title="계정 관리"
                                                    arrow
                                                >
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            navigate("/users")
                                                        }
                                                    >
                                                        <PeopleOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="삭제" arrow>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() =>
                                                            void handleDelete(
                                                                lic,
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
                    rowsPerPageOptions={[10, 20, 50]}
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
                        placeholder="키 / 설명 검색..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
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
                            라이선스 추가
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* 다이얼로그 */}
            <LicenseDialog
                key={dialogLicense?.id ?? "new"}
                open={licenseDialog.isOpen}
                onClose={licenseDialog.close}
                license={dialogLicense}
            />
        </Box>
    );
};

export default LicensesListPage;
