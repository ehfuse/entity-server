import { useState, useCallback, useMemo, useRef } from "react";
import {
    Box,
    Tab,
    Tabs,
    Alert,
    Snackbar,
    Chip,
    CircularProgress,
    IconButton,
    Tooltip,
    Paper,
    Button,
} from "@mui/material";
import { Refresh as RefreshIcon, Save as SaveIcon } from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { configsApi } from "../models/api";
import type { ConfigDomain } from "../models/types/config";
import ServerPage from "./pages/server";
import CORSPage from "./pages/cors";
import DatabasePage from "./pages/database";
import SecurityPage from "./pages/security";
import JwtPage from "./pages/jwt";
import CachePage from "./pages/cache";
import LoggingPage from "./pages/logging";
import OverlayScrollbar from "@ehfuse/overlay-scrollbar";

const domainOrder = [
    "server",
    "cors",
    "database",
    "security",
    "jwt",
    "cache",
    "logging",
];

const domainPageMap: Record<
    string,
    React.ComponentType<{
        item: ConfigDomain;
        onSave: (domain: string, config: Record<string, unknown>) => void;
        registerSave: (fn: () => void) => void;
    }>
> = {
    server: ServerPage,
    cors: CORSPage,
    database: DatabasePage,
    security: SecurityPage,
    jwt: JwtPage,
    cache: CachePage,
    logging: LoggingPage,
};

const ConfigsPage = () => {
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();

    // ?tab=domain 쿼리파라미터로 탐 커주기 (콘트롤드)
    const tabFromUrl = useMemo(() => {
        const domain = searchParams.get("tab");
        if (!domain) return null;
        const idx = domainOrder.indexOf(domain);
        return idx !== -1 ? idx : null;
    }, [searchParams]);

    const [manualTab, setManualTab] = useState<number | null>(null);
    const activeTab = manualTab ?? tabFromUrl ?? 0;
    const setActiveTab = (v: number) => setManualTab(v);

    const saveFnRef = useRef<(() => void) | null>(null);

    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "error";
    }>({ open: false, message: "", severity: "success" });

    const { data, isLoading, error } = useQuery({
        queryKey: ["admin-configs"],
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
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["admin-configs"] });
            setSnackbar({
                open: true,
                message: result.message || "설정이 저장되었습니다",
                severity: "success",
            });
        },
        onError: (err: Error) => {
            setSnackbar({
                open: true,
                message: err.message || "설정 저장 실패",
                severity: "error",
            });
        },
    });

    const handleRefresh = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["admin-configs"] });
    }, [queryClient]);

    const sortedItems = data?.items
        ? [...data.items].sort(
              (a, b) =>
                  domainOrder.indexOf(a.domain) - domainOrder.indexOf(b.domain),
          )
        : [];

    if (isLoading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 400,
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">
                    설정을 불러오는데 실패했습니다: {(error as Error).message}
                </Alert>
            </Box>
        );
    }

    const activeItem = sortedItems[activeTab];
    const ActivePage = activeItem ? domainPageMap[activeItem.domain] : null;

    return (
        <Paper
            sx={{
                p: 2,
                maxHeight: "100%",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #e2e8f0",
                    flexShrink: 0,
                }}
            >
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ flexGrow: 1 }}
                >
                    {sortedItems.map((item) => (
                        <Tab
                            key={item.domain}
                            label={
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.75,
                                    }}
                                >
                                    <span>{item.label}</span>
                                    {!item.exists && (
                                        <Chip
                                            label="없음"
                                            size="small"
                                            color="warning"
                                            sx={{
                                                height: 16,
                                                fontSize: "0.65rem",
                                            }}
                                        />
                                    )}
                                </Box>
                            }
                        />
                    ))}
                </Tabs>
                <Tooltip title="새로고침">
                    <IconButton
                        onClick={handleRefresh}
                        size="small"
                        sx={{ mr: 1 }}
                    >
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            <OverlayScrollbar
                style={{ flex: 1, minHeight: 0 }}
                track={{ alignment: "outside" }}
            >
                {activeItem && ActivePage && (
                    <ActivePage
                        key={activeItem.domain}
                        item={activeItem}
                        onSave={(domain, config) =>
                            updateMutation.mutate({ domain, config })
                        }
                        registerSave={(fn) => {
                            saveFnRef.current = fn;
                        }}
                    />
                )}
            </OverlayScrollbar>

            {/* 저장 버튼: 항상 화면 하단에 고정 */}
            <Box
                sx={{
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "flex-end",
                    pt: 1.5,
                    mt: 0.5,
                    borderTop: "1px solid #e2e8f0",
                }}
            >
                <Button
                    variant="contained"
                    size="large"
                    startIcon={
                        updateMutation.isPending ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : (
                            <SaveIcon />
                        )
                    }
                    onClick={() => saveFnRef.current?.()}
                    disabled={updateMutation.isPending}
                >
                    저장
                </Button>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() =>
                    setSnackbar((prev) => ({ ...prev, open: false }))
                }
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={snackbar.severity}
                    onClose={() =>
                        setSnackbar((prev) => ({ ...prev, open: false }))
                    }
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Paper>
    );
};

export default ConfigsPage;
