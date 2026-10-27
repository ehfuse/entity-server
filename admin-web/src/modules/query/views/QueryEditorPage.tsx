import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { PlayArrow as PlayArrowIcon } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useQueryController } from "../controllers/queryController";

const QueryEditorPage = () => {
    const [editorHeight, setEditorHeight] = useState(320);
    const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(
        null,
    );

    const {
        state,
        update,
        updateEntityName,
        updateLimitText,
        runQuery,
        entityOptions,
        entitiesLoading,
        entitiesError,
        executeLoading,
        executeError,
        formError,
        result,
    } = useQueryController();

    const columns = useMemo(() => {
        if (result.items.length === 0) {
            return [] as string[];
        }
        return Object.keys(result.items[0]);
    }, [result.items]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (!dragStateRef.current) {
                return;
            }

            const nextHeight =
                dragStateRef.current.startHeight +
                (event.clientY - dragStateRef.current.startY);
            const clampedHeight = Math.max(180, Math.min(700, nextHeight));
            setEditorHeight(clampedHeight);
        };

        const handleMouseUp = () => {
            dragStateRef.current = null;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };
    }, []);

    const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
        dragStateRef.current = {
            startY: event.clientY,
            startHeight: editorHeight,
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "row-resize";
    };

    return (
        <Paper
            sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minHeight: 0,
            }}
        >
            <Typography variant="h6">Query Editor</Typography>

            {entitiesError && (
                <Alert severity="error">
                    엔티티 목록을 불러오지 못했습니다: {entitiesError.message}
                </Alert>
            )}
            {formError && <Alert severity="warning">{formError}</Alert>}
            {executeError && (
                <Alert severity="error">
                    쿼리 실행 실패: {executeError.message}
                </Alert>
            )}

            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <FormControl sx={{ minWidth: 240 }} size="small">
                    <InputLabel id="query-entity-label">Entity</InputLabel>
                    <Select
                        labelId="query-entity-label"
                        label="Entity"
                        value={state.entityName}
                        onChange={(event) =>
                            updateEntityName(String(event.target.value))
                        }
                        disabled={entitiesLoading}
                    >
                        {entityOptions.map((entityName) => (
                            <MenuItem key={entityName} value={entityName}>
                                {entityName}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    label="Limit"
                    size="small"
                    value={state.limitText}
                    onChange={(event) => updateLimitText(event.target.value)}
                    sx={{ width: 140 }}
                />

                <Button
                    variant="contained"
                    startIcon={
                        executeLoading ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : (
                            <PlayArrowIcon />
                        )
                    }
                    onClick={() => void runQuery()}
                    disabled={executeLoading || entitiesLoading}
                >
                    Run
                </Button>
            </Stack>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Params (JSON Array)
                </Typography>
                <TextField
                    multiline
                    minRows={2}
                    fullWidth
                    value={state.paramsText}
                    onChange={(event) =>
                        update({ paramsText: event.target.value })
                    }
                />
            </Box>

            <Box sx={{ border: "1px solid #e2e8f0", borderRadius: 1 }}>
                <Editor
                    height={`${editorHeight}px`}
                    defaultLanguage="sql"
                    value={state.sql}
                    onChange={(value) => update({ sql: value ?? "" })}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                    }}
                />
            </Box>

            <Box
                onMouseDown={handleResizeStart}
                sx={{
                    height: 12,
                    cursor: "row-resize",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    userSelect: "none",
                }}
            >
                <Box
                    sx={{
                        width: 72,
                        height: 4,
                        borderRadius: 999,
                        bgcolor: "#cbd5e1",
                    }}
                />
            </Box>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Result ({result.count})
                </Typography>
                {result.items.length === 0 ? (
                    <Alert severity="info">실행 결과가 없습니다.</Alert>
                ) : (
                    <Box
                        sx={{
                            overflow: "auto",
                            border: "1px solid #e2e8f0",
                            borderRadius: 1,
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: "0.875rem",
                            }}
                        >
                            <thead>
                                <tr>
                                    {columns.map((column) => (
                                        <th
                                            key={column}
                                            style={{
                                                textAlign: "left",
                                                borderBottom:
                                                    "1px solid #e2e8f0",
                                                padding: "8px",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {result.items.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {columns.map((column) => (
                                            <td
                                                key={column}
                                                style={{
                                                    borderBottom:
                                                        "1px solid #f1f5f9",
                                                    padding: "8px",
                                                    verticalAlign: "top",
                                                }}
                                            >
                                                {typeof row[column] === "object"
                                                    ? JSON.stringify(
                                                          row[column],
                                                      )
                                                    : String(row[column] ?? "")}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Box>
                )}
            </Box>
        </Paper>
    );
};

export default QueryEditorPage;
