// modules/llm/views/LlmConversationDetailPage.tsx
import {
    Box,
    Stack,
    Typography,
    Paper,
    CircularProgress,
    Alert,
    Chip,
    Divider,
} from "@mui/material";
import { useParams } from "react-router-dom";
import { useLlmConversationDetailController } from "../controllers/llmController";

export default function LlmConversationDetailPage() {
    const { seq } = useParams<{ seq: string }>();
    const { conversation, conversationLoading } =
        useLlmConversationDetailController(Number(seq));

    if (conversationLoading) {
        return (
            <Box sx={{ textAlign: "center", py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!conversation) {
        return <Alert severity="error">대화를 찾을 수 없습니다.</Alert>;
    }

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="h5">
                    {conversation.title || "(제목 없음)"}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Chip
                        label={`Provider: ${conversation.provider}`}
                        size="small"
                        color="info"
                    />
                    <Chip
                        label={`총 토큰: ${conversation.total_tokens.toLocaleString()}`}
                        size="small"
                        variant="outlined"
                    />
                    <Chip
                        label={conversation.created_at}
                        size="small"
                        variant="outlined"
                    />
                </Stack>
            </Box>

            <Divider />

            <Stack spacing={2}>
                {conversation.messages.map((msg, idx) => (
                    <Box
                        key={idx}
                        sx={{
                            display: "flex",
                            justifyContent:
                                msg.role === "user" ? "flex-end" : "flex-start",
                        }}
                    >
                        <Paper
                            sx={{
                                p: 2,
                                maxWidth: "80%",
                                bgcolor:
                                    msg.role === "user"
                                        ? "primary.main"
                                        : "grey.100",
                                color:
                                    msg.role === "user"
                                        ? "white"
                                        : "text.primary",
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    display: "block",
                                    mb: 0.5,
                                    opacity: 0.7,
                                    textTransform: "uppercase",
                                }}
                            >
                                {msg.role}
                            </Typography>
                            <Typography
                                sx={{
                                    whiteSpace: "pre-wrap",
                                    fontFamily:
                                        msg.role === "assistant"
                                            ? "inherit"
                                            : "inherit",
                                }}
                            >
                                {msg.content}
                            </Typography>
                        </Paper>
                    </Box>
                ))}
            </Stack>
        </Stack>
    );
}
