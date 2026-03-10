// modules/llm/views/LlmDocumentsPage.tsx
import {
    Box,
    Stack,
    Typography,
    Button,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    IconButton,
    Tooltip,
    Alert,
    CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useState } from "react";
import { useLlmController } from "../controllers/llmController";
import DocumentUploadDialog from "./components/DocumentUploadDialog";
import type { LlmDocumentIngestRequest } from "../models/types/llm";

export default function LlmDocumentsPage() {
    const ctrl = useLlmController();
    const [uploadOpen, setUploadOpen] = useState(false);

    const handleIngest = async (req: LlmDocumentIngestRequest) => {
        await ctrl.ingestDocument(req);
        setUploadOpen(false);
    };

    return (
        <Stack spacing={3}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Typography variant="h5">RAG 문서 관리</Typography>
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        onClick={() => ctrl.rebuildIndex()}
                        disabled={ctrl.rebuildLoading}
                    >
                        {ctrl.rebuildLoading ? "재구성 중..." : "인덱스 재구성"}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => setUploadOpen(true)}
                    >
                        문서 업로드
                    </Button>
                    <Tooltip title="새로고침">
                        <IconButton onClick={ctrl.refreshAll}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {ctrl.documentsLoading ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : ctrl.documents.length === 0 ? (
                <Alert severity="info">등록된 RAG 문서가 없습니다.</Alert>
            ) : (
                <Paper>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>문서 ID</TableCell>
                                <TableCell>제목</TableCell>
                                <TableCell>형식</TableCell>
                                <TableCell>청크 수</TableCell>
                                <TableCell>생성일</TableCell>
                                <TableCell align="right">삭제</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {ctrl.documents.map((doc) => (
                                <TableRow key={doc.document_id} hover>
                                    <TableCell
                                        sx={{
                                            fontFamily: "monospace",
                                            fontSize: 12,
                                        }}
                                    >
                                        {doc.document_id}
                                    </TableCell>
                                    <TableCell>{doc.title}</TableCell>
                                    <TableCell>{doc.content_type}</TableCell>
                                    <TableCell>{doc.chunk_count}</TableCell>
                                    <TableCell>{doc.created_at}</TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() =>
                                                ctrl.deleteDocument(
                                                    doc.document_id,
                                                )
                                            }
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            <DocumentUploadDialog
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                onSubmit={handleIngest}
                loading={ctrl.ingestLoading}
                error={ctrl.ingestError}
            />
        </Stack>
    );
}
