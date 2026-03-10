// modules/llm/views/LlmDocumentDetailPage.tsx
import {
    Box,
    Stack,
    Typography,
    Paper,
    CircularProgress,
    Alert,
    Chip,
} from "@mui/material";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { admin } from "../../../api/entityServerClient";
import type { LlmDocumentListResponse } from "../models/types/llm";

export default function LlmDocumentDetailPage() {
    const { id } = useParams<{ id: string }>();

    const docListQuery = useQuery({
        queryKey: ["llm-documents"],
        queryFn: () =>
            admin.get<LlmDocumentListResponse>("/v1/llm/rag/documents", {
                limit: 1000,
            }),
        enabled: !!id,
    });

    const doc = docListQuery.data?.data.items.find((d) => d.document_id === id);

    if (docListQuery.isLoading) {
        return (
            <Box sx={{ textAlign: "center", py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!doc) {
        return <Alert severity="error">문서를 찾을 수 없습니다.</Alert>;
    }

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="h5">{doc.title}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Chip label={`형식: ${doc.content_type}`} size="small" />
                    <Chip
                        label={`청크: ${doc.chunk_count}`}
                        size="small"
                        color="info"
                    />
                    <Chip
                        label={doc.created_at}
                        size="small"
                        variant="outlined"
                    />
                </Stack>
            </Box>

            <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    문서 ID
                </Typography>
                <Typography
                    sx={{ fontFamily: "monospace", fontSize: 13 }}
                    color="text.secondary"
                >
                    {doc.document_id}
                </Typography>
            </Paper>

            <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2">
                    청크 수: {doc.chunk_count}개
                </Typography>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                >
                    청크 상세 내용은 서버 API를 통해 확인할 수 있습니다.
                </Typography>
            </Paper>
        </Stack>
    );
}
