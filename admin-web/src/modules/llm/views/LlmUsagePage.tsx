// modules/llm/views/LlmUsagePage.tsx
import {
    Box,
    Stack,
    Typography,
    Paper,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    CircularProgress,
    Alert,
    TextField,
    Card,
    CardContent,
    Button,
} from "@mui/material";
import { useState, useMemo } from "react";
import { useLlmUsageController } from "../controllers/llmController";

export default function LlmUsagePage() {
    const { today, thirtyDaysAgo } = useMemo(() => {
        const now = new Date();
        const ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return {
            today: now.toISOString().slice(0, 10),
            thirtyDaysAgo: ago.toISOString().slice(0, 10),
        };
    }, []);

    const [startDate, setStartDate] = useState(thirtyDaysAgo);
    const [endDate, setEndDate] = useState(today);
    const [provider, setProvider] = useState("");
    const [params, setParams] = useState<{
        start_date?: string;
        end_date?: string;
        provider?: string;
    }>({ start_date: thirtyDaysAgo, end_date: today });

    const { usageItems, usageLoading } = useLlmUsageController(params);

    const handleApply = () => {
        setParams({
            start_date: startDate || undefined,
            end_date: endDate || undefined,
            provider: provider || undefined,
        });
    };

    const totalRequests = usageItems.reduce((s, r) => s + r.requests, 0);
    const totalTokens = usageItems.reduce((s, r) => s + r.total_tokens, 0);
    const totalCost = usageItems.reduce((s, r) => s + r.estimated_cost, 0);

    return (
        <Stack spacing={3}>
            <Typography variant="h5">LLM 사용량</Typography>

            {/* 필터 */}
            <Paper sx={{ p: 2 }}>
                <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    flexWrap="wrap"
                >
                    <TextField
                        label="시작일"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        size="small"
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="종료일"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        size="small"
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="Provider"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        size="small"
                        placeholder="전체"
                    />
                    <Button
                        variant="contained"
                        onClick={handleApply}
                        size="small"
                    >
                        조회
                    </Button>
                </Stack>
            </Paper>

            {/* 요약 카드 */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
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
                                총 요청
                            </Typography>
                            <Typography variant="h5">
                                {totalRequests.toLocaleString()}
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
                            <Typography variant="h5">
                                {totalTokens.toLocaleString()}
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
                            <Typography variant="h5">
                                ${totalCost.toFixed(4)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Box>
            </Box>

            {/* 상세 테이블 */}
            {usageLoading ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : usageItems.length === 0 ? (
                <Alert severity="info">
                    해당 기간의 사용량 데이터가 없습니다.
                </Alert>
            ) : (
                <Paper>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>날짜</TableCell>
                                <TableCell>Provider</TableCell>
                                <TableCell>모델</TableCell>
                                <TableCell align="right">요청 수</TableCell>
                                <TableCell align="right">
                                    프롬프트 토큰
                                </TableCell>
                                <TableCell align="right">응답 토큰</TableCell>
                                <TableCell align="right">총 토큰</TableCell>
                                <TableCell align="right">비용 (USD)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {usageItems.map((item, idx) => (
                                <TableRow key={idx} hover>
                                    <TableCell>{item.date}</TableCell>
                                    <TableCell>{item.provider}</TableCell>
                                    <TableCell>{item.model}</TableCell>
                                    <TableCell align="right">
                                        {item.requests.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {item.prompt_tokens.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {item.completion_tokens.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        {item.total_tokens.toLocaleString()}
                                    </TableCell>
                                    <TableCell align="right">
                                        ${item.estimated_cost.toFixed(6)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Stack>
    );
}
