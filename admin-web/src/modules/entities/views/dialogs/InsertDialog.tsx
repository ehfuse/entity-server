import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Alert,
    IconButton,
    Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

interface DataInsertDialogProps {
    open: boolean;
    onClose: () => void;
    entityName: string;
    initialData?: Record<string, unknown> | null;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

const DataInsertDialog = ({
    open,
    onClose,
    entityName,
    initialData,
    onSubmit,
}: DataInsertDialogProps) => {
    const [jsonText, setJsonText] = useState("{}");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        const data = initialData || {};
        setJsonText(JSON.stringify(data, null, 4));
        setError("");
    }, [initialData, open]);

    const handleJsonChange = (val: string | undefined) => {
        const text = val ?? "";
        setJsonText(text);
        try {
            JSON.parse(text);
            setError("");
        } catch (e) {
            if (e instanceof SyntaxError) {
                setError(`JSON 문법 오류: ${e.message}`);
            }
        }
    };

    const handleFormat = () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
        setError("");
    };

    const handleSubmit = async () => {
        try {
            setSaving(true);
            setError("");
            const currentText = editorRef.current?.getValue() ?? jsonText;
            const parsed = JSON.parse(currentText) as Record<string, unknown>;
            await onSubmit(parsed);
            onClose();
        } catch (err: unknown) {
            if (err instanceof SyntaxError) {
                setError("JSON 형식이 올바르지 않습니다.");
            } else {
                setError("저장 중 오류가 발생했습니다.");
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    pr: 2,
                }}
            >
                <Typography variant="h6" component="span">
                    {entityName} 데이터 추가
                </Typography>
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {error && (
                    <Alert severity="error" sx={{ m: 2 }}>
                        {error}
                    </Alert>
                )}
                <Box sx={{ bgcolor: "#1e1e1e" }}>
                    <Editor
                        height="60vh"
                        language="json"
                        theme="vs-dark"
                        value={jsonText}
                        onChange={handleJsonChange}
                        onMount={(editor) => {
                            editorRef.current = editor;
                        }}
                        options={{
                            fontSize: 14,
                            fontFamily: "D2Coding",
                            tabSize: 4,
                            insertSpaces: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            formatOnPaste: true,
                            bracketPairColorization: { enabled: true },
                            guides: { bracketPairs: false },
                            padding: { top: 8, bottom: 8 },
                        }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleFormat} size="large" color="inherit">
                    Format
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button onClick={onClose} disabled={saving} size="large">
                    취소
                </Button>
                <Button
                    size="large"
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={saving}
                >
                    저장
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default DataInsertDialog;
