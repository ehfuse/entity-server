// modules/llm/views/LlmConversationsPage.tsx
import {
    Box,
    Stack,
    Typography,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    IconButton,
    CircularProgress,
    Alert,
    Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useNavigate } from "react-router-dom";
import { useLlmController } from "../controllers/llmController";

export default function LlmConversationsPage() {
    const ctrl = useLlmController();
    const navigate = useNavigate();

    return (
        <Stack spacing={3}>
            <Typography variant="h5">대화 내역</Typography>

            {ctrl.conversationsLoading ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : ctrl.conversations.length === 0 ? (
                <Alert severity="info">대화 내역이 없습니다.</Alert>
            ) : (
                <Paper>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Seq</TableCell>
                                <TableCell>제목</TableCell>
                                <TableCell>Provider</TableCell>
                                <TableCell>메시지 수</TableCell>
                                <TableCell>총 토큰</TableCell>
                                <TableCell>최근 수정</TableCell>
                                <TableCell align="right">액션</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {ctrl.conversations.map((conv) => (
                                <TableRow key={conv.seq} hover>
                                    <TableCell>{conv.seq}</TableCell>
                                    <TableCell>
                                        {conv.title || "(제목 없음)"}
                                    </TableCell>
                                    <TableCell>{conv.provider}</TableCell>
                                    <TableCell>{conv.message_count}</TableCell>
                                    <TableCell>
                                        {conv.total_tokens.toLocaleString()}
                                    </TableCell>
                                    <TableCell>{conv.updated_at}</TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="상세 보기">
                                            <IconButton
                                                size="small"
                                                onClick={() =>
                                                    navigate(
                                                        `/llm/conversations/${conv.seq}`,
                                                    )
                                                }
                                            >
                                                <OpenInNewIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="삭제">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() =>
                                                    ctrl.deleteConversation(
                                                        conv.seq,
                                                    )
                                                }
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
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
