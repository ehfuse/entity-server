// modules/llm/views/LlmDashboardPage.tsx
import {
    Box,
    Card,
    CardContent,
    Stack,
    Typography,
    Chip,
    CircularProgress,
    Alert,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { useLlmController } from "../controllers/llmController";

export default function LlmDashboardPage() {
    const ctrl = useLlmController();

    if (ctrl.providersLoading) {
        return (
            <Box sx={{ textAlign: "center", py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack spacing={3}>
            <Typography
                variant="h5"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
                <SmartToyIcon /> LLM 관리
            </Typography>

            {/* 프로바이더 상태 */}
            <Typography variant="h6">프로바이더 상태</Typography>
            {ctrl.providers.length === 0 ? (
                <Alert severity="info">등록된 프로바이더가 없습니다.</Alert>
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
                                        alignItems="center"
                                    >
                                        <Typography fontWeight={600}>
                                            {p.name}
                                        </Typography>
                                        <Chip
                                            label={p.status}
                                            size="small"
                                            color={
                                                p.status === "ok"
                                                    ? "success"
                                                    : "error"
                                            }
                                        />
                                    </Stack>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        {p.driver} / {p.model}
                                    </Typography>
                                    {p.is_default && (
                                        <Chip
                                            label="기본"
                                            size="small"
                                            sx={{ ml: 1 }}
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </Box>
                    ))}
                </Box>
            )}

            {/* 사용량 요약 */}
            {ctrl.usageSummary && (
                <>
                    <Typography variant="h6">오늘 사용량 요약</Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "1fr 1fr 1fr",
                            },
                            gap: 2,
                        }}
                    >
                        <Box>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        총 요청 수
                                    </Typography>
                                    <Typography variant="h4">
                                        {ctrl.usageSummary.total_requests.toLocaleString()}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>
                        <Box>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        총 토큰
                                    </Typography>
                                    <Typography variant="h4">
                                        {ctrl.usageSummary.total_tokens.toLocaleString()}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>
                        <Box>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                    >
                                        추정 비용 (USD)
                                    </Typography>
                                    <Typography variant="h4">
                                        $
                                        {ctrl.usageSummary.estimated_cost.toFixed(
                                            4,
                                        )}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>
                    </Box>
                </>
            )}

            {/* RAG 문서 현황 */}
            <Typography variant="h6">RAG 문서 현황</Typography>
            <Card variant="outlined">
                <CardContent>
                    <Typography>
                        총 문서: <strong>{ctrl.documentsTotal}</strong>건
                    </Typography>
                </CardContent>
            </Card>
        </Stack>
    );
}
