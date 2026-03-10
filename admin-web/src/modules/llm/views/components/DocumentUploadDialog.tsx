// modules/llm/views/components/DocumentUploadDialog.tsx
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    Alert,
} from "@mui/material";
import { useState } from "react";
import type { LlmDocumentIngestRequest } from "../../models/types/llm";

interface Props {
    open: boolean;
    onClose: () => void;
    onSubmit: (req: LlmDocumentIngestRequest) => Promise<void>;
    loading: boolean;
    error: string | null;
}

export default function DocumentUploadDialog({
    open,
    onClose,
    onSubmit,
    loading,
    error,
}: Props) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [contentType, setContentType] = useState<"text" | "markdown" | "pdf">(
        "text",
    );
    const [provider, setProvider] = useState("");
    const [chunkSize, setChunkSize] = useState(500);

    const handleClose = () => {
        setTitle("");
        setContent("");
        setContentType("text");
        setProvider("");
        setChunkSize(500);
        onClose();
    };

    const handleSubmit = async () => {
        if (!title.trim() || !content.trim()) return;
        await onSubmit({
            title: title.trim(),
            content: content.trim(),
            content_type: contentType,
            provider: provider || undefined,
            chunk_size: chunkSize,
        });
        handleClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>RAG 문서 업로드</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label="제목"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        fullWidth
                        required
                    />
                    <FormControl fullWidth>
                        <InputLabel>형식</InputLabel>
                        <Select
                            value={contentType}
                            label="형식"
                            onChange={(e) =>
                                setContentType(
                                    e.target.value as
                                        | "text"
                                        | "markdown"
                                        | "pdf",
                                )
                            }
                        >
                            <MenuItem value="text">텍스트</MenuItem>
                            <MenuItem value="markdown">마크다운</MenuItem>
                            <MenuItem value="pdf">PDF</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        label="내용"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        fullWidth
                        multiline
                        rows={8}
                        required
                    />
                    <TextField
                        label="Provider (비워두면 기본값)"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        fullWidth
                    />
                    <TextField
                        label="청크 크기 (토큰)"
                        type="number"
                        value={chunkSize}
                        onChange={(e) => setChunkSize(Number(e.target.value))}
                        fullWidth
                        inputProps={{ min: 100, max: 2000 }}
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={loading}>
                    취소
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={loading || !title.trim() || !content.trim()}
                >
                    {loading ? "업로드 중..." : "업로드"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
