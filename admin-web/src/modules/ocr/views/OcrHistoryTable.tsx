// modules/ocr/views/OcrHistoryTable.tsx
import {
    Paper,
    Typography,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Chip,
    CircularProgress,
    Box,
} from "@mui/material";
import type { OcrResultItem } from "../models/types/ocr";

interface Props {
    items: OcrResultItem[];
    total: number;
    loading: boolean;
}

const stateColors: Record<string, "success" | "warning" | "error"> = {
    completed: "success",
    pending: "warning",
    failed: "error",
};

export default function OcrHistoryTable({ items, total, loading }: Props) {
    return (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                인식 이력 ({total}건)
            </Typography>

            {loading ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                    <CircularProgress />
                </Box>
            ) : items.length === 0 ? (
                <Typography
                    color="text.secondary"
                    sx={{ textAlign: "center", py: 4 }}
                >
                    인식 이력이 없습니다.
                </Typography>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>문서 유형</TableCell>
                            <TableCell>상태</TableCell>
                            <TableCell>신뢰도</TableCell>
                            <TableCell>처리시간</TableCell>
                            <TableCell>Provider</TableCell>
                            <TableCell>일시</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id} hover>
                                <TableCell
                                    sx={{
                                        fontFamily: "monospace",
                                        fontSize: 12,
                                    }}
                                >
                                    {item.id}
                                </TableCell>
                                <TableCell>{item.doc_type}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={item.state}
                                        size="small"
                                        color={
                                            stateColors[item.state] ?? "default"
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    {(item.confidence * 100).toFixed(1)}%
                                </TableCell>
                                <TableCell>{item.processing_ms}ms</TableCell>
                                <TableCell>{item.provider}</TableCell>
                                <TableCell>{item.created_at}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Paper>
    );
}
