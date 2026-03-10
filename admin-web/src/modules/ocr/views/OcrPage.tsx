// modules/ocr/views/OcrPage.tsx
import {
    Box,
    Paper,
    Stack,
    Typography,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Alert,
    LinearProgress,
    Chip,
    Divider,
    Switch,
    FormControlLabel,
} from "@mui/material";
import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import {
    useOcrController,
    DOC_TYPE_OPTIONS,
} from "../controllers/ocrController";
import type { DocType } from "../models/types/ocr";
import OcrHistoryTable from "./OcrHistoryTable";
import OcrResultPanel from "./OcrResultPanel";

export default function OcrPage() {
    const ctrl = useOcrController();

    return (
        <Stack spacing={3}>
            {/* 헤더 + 쿼터 */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Typography
                    variant="h5"
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                    <DocumentScannerIcon /> OCR 문서 인식
                </Typography>
                {ctrl.quota && (
                    <Chip
                        label={`사용량: ${ctrl.quota.used} / ${ctrl.quota.limit}`}
                        color={
                            ctrl.quota.used >= ctrl.quota.limit
                                ? "error"
                                : "default"
                        }
                        variant="outlined"
                    />
                )}
            </Box>

            {/* 입력 영역 */}
            <Paper sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                    <FormControl fullWidth>
                        <InputLabel>문서 종류</InputLabel>
                        <Select
                            value={ctrl.docType}
                            label="문서 종류"
                            onChange={(e) =>
                                ctrl.setDocType(e.target.value as DocType)
                            }
                        >
                            {DOC_TYPE_OPTIONS.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                    <Box>
                                        <Typography>{opt.label}</Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            {opt.description}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* 드래그앤드롭 업로드 영역 */}
                    <Box
                        sx={{
                            border: "2px dashed",
                            borderColor: ctrl.selectedFile
                                ? "primary.main"
                                : "grey.400",
                            borderRadius: 2,
                            p: 4,
                            textAlign: "center",
                            cursor: "pointer",
                            bgcolor: ctrl.selectedFile
                                ? "primary.50"
                                : "grey.50",
                            transition: "all 0.2s",
                            "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "primary.50",
                            },
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file) ctrl.handleFileSelect(file);
                        }}
                        onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*,.pdf";
                            input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement)
                                    .files?.[0];
                                if (file) ctrl.handleFileSelect(file);
                            };
                            input.click();
                        }}
                    >
                        <CloudUploadIcon
                            sx={{ fontSize: 48, color: "grey.500", mb: 1 }}
                        />
                        <Typography variant="body1">
                            {ctrl.selectedFile
                                ? ctrl.selectedFile.name
                                : "이미지 또는 PDF 파일을 드래그하거나 클릭하여 선택"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            지원 형식: JPG, PNG, BMP, TIFF, PDF (최대 20MB)
                        </Typography>
                    </Box>

                    {/* 이미지 미리보기 */}
                    {ctrl.previewUrl &&
                        ctrl.selectedFile?.type.startsWith("image/") && (
                            <Box sx={{ textAlign: "center" }}>
                                <img
                                    src={ctrl.previewUrl}
                                    alt="Preview"
                                    style={{
                                        maxWidth: "100%",
                                        maxHeight: 400,
                                        borderRadius: 8,
                                    }}
                                />
                            </Box>
                        )}

                    <FormControlLabel
                        control={
                            <Switch
                                checked={ctrl.includeBoxes}
                                onChange={(e) =>
                                    ctrl.setIncludeBoxes(e.target.checked)
                                }
                            />
                        }
                        label="텍스트 블록 좌표 포함 (include_boxes)"
                    />

                    <Button
                        variant="contained"
                        size="large"
                        startIcon={<DocumentScannerIcon />}
                        onClick={ctrl.runRecognize}
                        disabled={!ctrl.selectedFile || ctrl.recognizeLoading}
                        sx={{ py: 1.5 }}
                    >
                        {ctrl.recognizeLoading ? "인식 중..." : "OCR 인식 시작"}
                    </Button>

                    {ctrl.recognizeLoading && <LinearProgress />}
                    {ctrl.recognizeError && (
                        <Alert severity="error">{ctrl.recognizeError}</Alert>
                    )}
                </Stack>
            </Paper>

            {/* 결과 영역 */}
            {ctrl.result && <OcrResultPanel result={ctrl.result} />}

            {/* 인식 이력 */}
            <Divider />
            <OcrHistoryTable
                items={ctrl.history}
                total={ctrl.historyTotal}
                loading={ctrl.historyLoading}
            />
        </Stack>
    );
}
