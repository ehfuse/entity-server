// modules/llm/views/LlmProvidersPage.tsx
import {
    Box,
    Card,
    CardContent,
    Stack,
    Typography,
    Chip,
    CircularProgress,
    Alert,
    IconButton,
    Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useLlmController } from "../controllers/llmController";

export default function LlmProvidersPage() {
    const ctrl = useLlmController();

    return (
        <Stack spacing={3}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Typography variant="h5">프로바이더 관리</Typography>
                <Tooltip title="새로고침">
                    <IconButton onClick={ctrl.refreshAll}>
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {ctrl.providersLoading ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : ctrl.providers.length === 0 ? (
                <Alert severity="info">
                    등록된 프로바이더가 없습니다. configs/extensions/llm.json을
                    확인하세요.
                </Alert>
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            sm: "1fr 1fr",
                            md: "1fr 1fr 1fr",
                        },
                        gap: 2,
                    }}
                >
                    {ctrl.providers.map((p) => (
                        <Box key={p.name}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="flex-start"
                                    >
                                        <Box>
                                            <Typography
                                                variant="h6"
                                                fontWeight={600}
                                            >
                                                {p.name}
                                                {p.is_default && (
                                                    <Chip
                                                        label="기본"
                                                        size="small"
                                                        sx={{ ml: 1 }}
                                                        color="primary"
                                                    />
                                                )}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                드라이버: {p.driver}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                모델: {p.model}
                                            </Typography>
                                        </Box>
                                        <Chip
                                            label={
                                                p.status === "ok"
                                                    ? "정상"
                                                    : "오류"
                                            }
                                            color={
                                                p.status === "ok"
                                                    ? "success"
                                                    : "error"
                                            }
                                        />
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Box>
                    ))}
                </Box>
            )}

            {/* 캐시 통계 */}
            {ctrl.cacheStats && (
                <>
                    <Typography variant="h6">캐시 통계</Typography>
                    <Card variant="outlined">
                        <CardContent>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: {
                                        xs: "1fr 1fr",
                                        sm: "1fr 1fr 1fr 1fr",
                                    },
                                    gap: 2,
                                }}
                            >
                                <Box>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        상태
                                    </Typography>
                                    <Typography>
                                        {ctrl.cacheStats.enabled
                                            ? "활성"
                                            : "비활성"}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        히트율
                                    </Typography>
                                    <Typography>
                                        {(
                                            ctrl.cacheStats.hit_rate * 100
                                        ).toFixed(1)}
                                        %
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        항목 수
                                    </Typography>
                                    <Typography>
                                        {ctrl.cacheStats.entries}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        TTL
                                    </Typography>
                                    <Typography>
                                        {ctrl.cacheStats.ttl_seconds}초
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </>
            )}
        </Stack>
    );
}
