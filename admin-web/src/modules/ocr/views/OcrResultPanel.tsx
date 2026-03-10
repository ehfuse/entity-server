// modules/ocr/views/OcrResultPanel.tsx
import { Paper, Stack, Typography, Chip, Box, Tabs, Tab } from "@mui/material";
import { useState } from "react";
import type { OcrRecognizeResponse } from "../models/types/ocr";

interface Props {
    result: OcrRecognizeResponse;
}

export default function OcrResultPanel({ result }: Props) {
    const [tab, setTab] = useState(0);

    const hasParsed = !!result.parsed;
    const hasMultiPages = result.pages.length > 1;

    return (
        <Paper sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
                <Chip label={`ID: ${result.id}`} size="small" />
                <Chip
                    label={`Provider: ${result.provider}`}
                    size="small"
                    color="info"
                />
                <Chip
                    label={`신뢰도: ${(result.confidence * 100).toFixed(1)}%`}
                    size="small"
                    color={result.confidence >= 0.8 ? "success" : "warning"}
                />
                <Chip
                    label={`${result.processing_ms}ms`}
                    size="small"
                    variant="outlined"
                />
                {result.parsed && (
                    <Chip
                        label={`파싱: ${result.parsed.parse_method}`}
                        size="small"
                        color={
                            result.parsed.parse_method === "template"
                                ? "success"
                                : "secondary"
                        }
                    />
                )}
            </Stack>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab label="전체 텍스트" />
                {hasParsed && <Tab label="파싱 결과" />}
                {hasMultiPages && (
                    <Tab label={`페이지 (${result.pages.length})`} />
                )}
            </Tabs>

            {/* 탭 0: 전체 텍스트 */}
            {tab === 0 && (
                <Box
                    sx={{
                        bgcolor: "grey.50",
                        borderRadius: 1,
                        p: 2,
                        fontFamily: "monospace",
                        fontSize: 14,
                        whiteSpace: "pre-wrap",
                        maxHeight: 500,
                        overflow: "auto",
                    }}
                >
                    {result.text}
                </Box>
            )}

            {/* 탭 1: 파싱 결과 */}
            {tab === 1 && hasParsed && result.parsed && (
                <Box
                    sx={{
                        bgcolor: "grey.50",
                        borderRadius: 1,
                        p: 2,
                        overflow: "auto",
                    }}
                >
                    <ParsedFieldsTable
                        parsed={result.parsed as Record<string, unknown>}
                    />
                </Box>
            )}

            {/* 탭 2: 페이지별 */}
            {tab === (hasParsed ? 2 : 1) && hasMultiPages && (
                <Stack spacing={2}>
                    {result.pages.map((page) => (
                        <Paper
                            key={page.page_num}
                            variant="outlined"
                            sx={{ p: 2 }}
                        >
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                페이지 {page.page_num} — {page.width}×
                                {page.height}{" "}
                                <Chip
                                    label={`${(page.confidence * 100).toFixed(1)}%`}
                                    size="small"
                                    variant="outlined"
                                />
                            </Typography>
                            <Box
                                sx={{
                                    fontFamily: "monospace",
                                    fontSize: 13,
                                    whiteSpace: "pre-wrap",
                                    maxHeight: 300,
                                    overflow: "auto",
                                }}
                            >
                                {page.text}
                            </Box>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}

function ParsedFieldsTable({ parsed }: { parsed: Record<string, unknown> }) {
    const docType = parsed.doc_type as string;
    const parseMethod = parsed.parse_method as string;
    const fields = parsed[docType] as Record<string, unknown> | undefined;

    if (!fields || typeof fields !== "object") {
        return (
            <Typography color="text.secondary">
                파싱된 필드가 없습니다.
            </Typography>
        );
    }

    return (
        <Box
            component="table"
            sx={{ width: "100%", borderCollapse: "collapse" }}
        >
            <Box component="thead">
                <Box component="tr">
                    <Box
                        component="th"
                        sx={{
                            textAlign: "left",
                            p: 1,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        필드명
                    </Box>
                    <Box
                        component="th"
                        sx={{
                            textAlign: "left",
                            p: 1,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        값
                    </Box>
                </Box>
            </Box>
            <Box component="tbody">
                <Box component="tr">
                    <Box
                        component="td"
                        sx={{ p: 1, fontWeight: 600, color: "text.secondary" }}
                    >
                        doc_type
                    </Box>
                    <Box component="td" sx={{ p: 1 }}>
                        {docType}
                    </Box>
                </Box>
                <Box component="tr">
                    <Box
                        component="td"
                        sx={{ p: 1, fontWeight: 600, color: "text.secondary" }}
                    >
                        parse_method
                    </Box>
                    <Box component="td" sx={{ p: 1 }}>
                        <Chip
                            label={parseMethod}
                            size="small"
                            color={
                                parseMethod === "template"
                                    ? "success"
                                    : "secondary"
                            }
                        />
                    </Box>
                </Box>
                {Object.entries(fields).map(([key, value]) => (
                    <Box component="tr" key={key}>
                        <Box
                            component="td"
                            sx={{
                                p: 1,
                                fontWeight: 600,
                                color: "text.secondary",
                                borderTop: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            {key}
                        </Box>
                        <Box
                            component="td"
                            sx={{
                                p: 1,
                                fontFamily: "monospace",
                                borderTop: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            {typeof value === "object"
                                ? JSON.stringify(value, null, 2)
                                : String(value ?? "")}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
