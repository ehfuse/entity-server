import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Paper,
    Slider,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    RestartAlt as RestartAltIcon,
} from "@mui/icons-material";
import {
    OverlayScrollbar,
    type OverlayScrollbarRef,
} from "@ehfuse/overlay-scrollbar";
import { SearchTextField } from "@ehfuse/mui-form-controls";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { erdApi } from "../models/api";
import type { ERDEntityMeta } from "../models/types/erd";

type ERDEntity = {
    name: string;
    dbGroup: string;
    fields: string[];
    fieldTypes: Record<string, string>;
};

type ERDRelation = {
    from: string;
    to: string;
    field: string;
    type: "direct" | "polymorphic";
};

// 필드명 패턴 기반 타입 추론 (Go inferColumnType 동일 로직)
const inferFieldType = (fieldName: string): string => {
    const lower = fieldName.toLowerCase();
    if (lower.endsWith("_seq") || lower.endsWith("_id")) return "bigint";
    if (lower.endsWith("_date")) return "date";
    if (lower.endsWith("_time") || lower.endsWith("_at")) return "datetime";
    if (
        lower.startsWith("is_") ||
        lower.startsWith("has_") ||
        lower.startsWith("can_")
    )
        return "boolean";
    if (
        lower.endsWith("_amount") ||
        lower.endsWith("_price") ||
        lower.endsWith("_total") ||
        lower.endsWith("_cost")
    )
        return "decimal";
    if (
        lower.endsWith("_count") ||
        lower.endsWith("_cnt") ||
        lower.endsWith("_qty") ||
        lower.endsWith("_quantity")
    )
        return "int";
    if (lower === "name" || lower.endsWith("_name")) return "varchar";
    if (lower.includes("email")) return "varchar";
    if (lower.includes("phone") || lower.includes("tel")) return "varchar";
    return "varchar";
};

// Mermaid ERD 타입 안전 문자열로 변환 (공백·괄호 제거)
const sanitizeMermaidType = (raw: string): string => {
    const s = raw.trim().toLowerCase();
    if (s.startsWith("bigint")) return "bigint";
    if (s.startsWith("varchar") || s.startsWith("char")) return "varchar";
    if (s.startsWith("decimal") || s.startsWith("numeric")) return "decimal";
    if (s.startsWith("tinyint")) return "tinyint";
    if (s.startsWith("smallint")) return "smallint";
    if (s.startsWith("mediumtext")) return "mediumtext";
    if (s.startsWith("longtext")) return "longtext";
    if (s === "boolean" || s === "bool") return "boolean";
    // 남은 공백·괄호 제거
    return s.replace(/[^a-z0-9_]/g, "") || "varchar";
};

const normalizeEntity = (raw: ERDEntityMeta): ERDEntity | null => {
    const name = String(raw.name || "").trim();
    if (!name) return null;

    const fields = Array.from(
        new Set(
            (raw.fields || []).map((v) => String(v).trim()).filter(Boolean),
        ),
    ).sort((a, b) => a.localeCompare(b));

    const fieldTypes: Record<string, string> = {};
    // 서버 제공 컬럼 타입 우선, 없으면 패턴 추론
    const serverCols: Record<string, string> = {};
    for (const col of raw.tables?.index?.columns || []) {
        const colName = String(col.name || "").trim();
        if (!colName) continue;
        serverCols[colName] = sanitizeMermaidType(
            String(col.type || "").trim(),
        );
    }
    for (const field of fields) {
        fieldTypes[field] = serverCols[field] || inferFieldType(field);
    }

    return {
        name,
        dbGroup: String(raw.db_group || "").trim() || "default",
        fields,
        fieldTypes,
    };
};

const inferRelations = (entities: ERDEntity[]): ERDRelation[] => {
    const names = new Set(entities.map((e) => e.name));
    const relations: ERDRelation[] = [];

    for (const entity of entities) {
        if (
            entity.fields.includes("ref_entity") &&
            entity.fields.includes("ref_seq")
        ) {
            relations.push({
                from: entity.name,
                to: "ANY_ENTITY",
                field: "ref_entity/ref_seq",
                type: "polymorphic",
            });
        }

        for (const field of entity.fields) {
            const isSeqFk = field.endsWith("_seq") && field !== "seq";
            const isIdFk = field.endsWith("_id") && field !== "id";
            if (!isSeqFk && !isIdFk) continue;

            const target = isSeqFk ? field.slice(0, -4) : field.slice(0, -3);
            if (!target || !names.has(target)) continue;
            relations.push({
                from: entity.name,
                to: target,
                field,
                type: "direct",
            });
        }
    }

    return relations.sort((a, b) =>
        `${a.from}:${a.field}:${a.to}`.localeCompare(
            `${b.from}:${b.field}:${b.to}`,
        ),
    );
};

const ERD_THEME_VARIABLES = {
    primaryColor: "#5b8dc7",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#2c5282",
    secondaryTextColor: "#1a1a1a",
    lineColor: "#000000",
    edgeLabelBackground: "#ffffff",
    attributeBackgroundColorEven: "#ffffff",
    attributeBackgroundColorOdd: "#ffffff",
    fontFamily: "'D2Coding', monospace",
};

const buildMermaidERD = (
    entities: ERDEntity[],
    relations: ERDRelation[],
    includeTypes: boolean,
) => {
    const initConfig = {
        theme: "base",
        themeVariables: ERD_THEME_VARIABLES,
        er: { useMaxWidth: false, layoutDirection: "TB" },
        layout: "elk",
    };
    const lines: string[] = [
        `%%{init: ${JSON.stringify(initConfig)}}%%`,
        "erDiagram",
    ];

    for (const rel of relations) {
        const right = rel.type === "polymorphic" ? "}|..||" : "}|--||";
        const paddedSpace = "\u2009";
        const relationLabel = `${paddedSpace}${rel.field.replace(/"/g, '\\"')}${paddedSpace}`;
        lines.push(`  ${rel.from} ${right} ${rel.to} : "${relationLabel}"`);
    }

    for (const entity of entities) {
        lines.push(`  ${entity.name} {`);
        lines.push("    bigint seq");
        if (entity.fields.length === 0) {
            lines.push("    string _no_index_fields");
        } else {
            for (const field of entity.fields) {
                const type = includeTypes
                    ? entity.fieldTypes[field] || "string"
                    : "string";
                lines.push(`    ${type} ${field}`);
            }
        }
        lines.push("  }");
    }

    if (relations.some((r) => r.type === "polymorphic")) {
        lines.push("  ANY_ENTITY {");
        lines.push("    string polymorphic_target");
        lines.push("  }");
    }

    return lines.join("\n");
};

const addSvgPadding = (svgStr: string, pad: number): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return svgStr;

    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
        const parts = vb.trim().split(/[\s,]+/);
        if (parts.length === 4) {
            const x = parseFloat(parts[0]) - pad;
            const y = parseFloat(parts[1]) - pad;
            const w = parseFloat(parts[2]) + pad * 2;
            const h = parseFloat(parts[3]) + pad * 2;
            svgEl.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
            const curW = parseFloat(svgEl.getAttribute("width") || "0");
            const curH = parseFloat(svgEl.getAttribute("height") || "0");
            if (curW) svgEl.setAttribute("width", String(curW + pad * 2));
            if (curH) svgEl.setAttribute("height", String(curH + pad * 2));
        }
    }

    // 필드 행 배경(짝/홀)을 모두 흰색으로 고정 (스트라이프 제거)
    svgEl
        .querySelectorAll<SVGPathElement>(
            ".row-rect-even path, .row-rect-odd path",
        )
        .forEach((pathEl) => {
            pathEl.setAttribute("fill", "#ffffff");
        });

    // 엔티티명(헤더) 텍스트는 흰색
    svgEl
        .querySelectorAll<SVGElement>(
            "g.label.name text, g.label.name tspan, g.label.name foreignObject *",
        )
        .forEach((el) => {
            el.setAttribute("fill", "#ffffff");
            const style = el.getAttribute("style") ?? "";
            el.setAttribute("style", `${style}; color: #ffffff;`.trim());
        });

    // 필드 텍스트는 검정
    svgEl
        .querySelectorAll<SVGElement>(
            "g.label.attribute-type text, g.label.attribute-type tspan, g.label.attribute-type foreignObject *, g.label.attribute-name text, g.label.attribute-name tspan, g.label.attribute-name foreignObject *, g.label.attribute-keys text, g.label.attribute-keys tspan, g.label.attribute-keys foreignObject *, g.label.attribute-comment text, g.label.attribute-comment tspan, g.label.attribute-comment foreignObject *",
        )
        .forEach((el) => {
            el.setAttribute("fill", "#1a1a1a");
            const style = el.getAttribute("style") ?? "";
            el.setAttribute("style", `${style}; color: #1a1a1a;`.trim());
        });

    // FK 라벨 배경(rect) 좌우 패딩
    const fkLabelPadX = 10;
    svgEl
        .querySelectorAll<SVGRectElement>("g.edgeLabel rect")
        .forEach((rect) => {
            const width = parseFloat(rect.getAttribute("width") ?? "");
            const x = parseFloat(rect.getAttribute("x") ?? "");

            if (Number.isFinite(width)) {
                rect.setAttribute("width", String(width + fkLabelPadX * 2));
            }
            if (Number.isFinite(x)) {
                rect.setAttribute("x", String(x - fkLabelPadX));
            }
        });

    // FK 라벨 텍스트는 검정으로 고정
    svgEl
        .querySelectorAll<SVGElement>(
            "g.edgeLabel text, g.edgeLabel tspan, g.edgeLabel foreignObject *",
        )
        .forEach((el) => {
            el.setAttribute("fill", "#1a1a1a");
            const style = el.getAttribute("style") ?? "";
            el.setAttribute("style", `${style}; color: #1a1a1a;`.trim());
        });

    return new XMLSerializer().serializeToString(svgEl);
};

const ErdMermaidPage = () => {
    const [keyword, setKeyword] = useState("");
    const [svg, setSvg] = useState("");
    const [renderError, setRenderError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(0.7);
    const [isDragging, setIsDragging] = useState(false);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newEntityName, setNewEntityName] = useState("");

    const viewportRef = useRef<OverlayScrollbarRef | null>(null);
    const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    const clampZoom = (value: number) => Math.max(0.2, Math.min(1.2, value));
    const getViewport = () => viewportRef.current?.getScrollContainer() ?? null;
    const resetView = () => {
        setZoom(0.7);
        setKeyword("");
        const viewport = getViewport();
        if (viewport) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
    };

    // SVG가 바뀔 때 스크롤 위치 초기화
    useEffect(() => {
        if (!svg) return;
        const viewport = getViewport();
        if (viewport) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
    }, [svg]);

    const entitiesQuery = useQuery({
        queryKey: ["erd", "mermaid"],
        queryFn: async (): Promise<ERDEntity[]> => {
            const schema = await erdApi.getSchema();
            return schema.entities
                .map(normalizeEntity)
                .filter((v): v is ERDEntity => Boolean(v))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        staleTime: 30_000,
    });

    // 각 엔티티를 클릭했을 때 ERD에 표시될 실제 테이블 수 (filteredEntities 시뮬레이션)
    const erdCountByEntity = useMemo(() => {
        const allEntities = entitiesQuery.data || [];
        const counts: Record<string, number> = {};
        allEntities.forEach((entity) => {
            const q = entity.name.toLowerCase();
            counts[entity.name] = allEntities.filter((e) => {
                if (e.name.toLowerCase().includes(q)) return true;
                return e.fields.some((f) => f.toLowerCase().includes(q));
            }).length;
        });
        return counts;
    }, [entitiesQuery.data]);

    const filteredEntities = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        const all = entitiesQuery.data || [];
        return all.filter((entity) => {
            if (!q) return true;
            if (entity.name.toLowerCase().includes(q)) return true;
            return entity.fields.some((field) =>
                field.toLowerCase().includes(q),
            );
        });
    }, [entitiesQuery.data, keyword]);

    const relations = useMemo(
        () => inferRelations(filteredEntities),
        [filteredEntities],
    );

    const mermaidCode = useMemo(
        () => buildMermaidERD(filteredEntities, relations, true),
        [filteredEntities, relations],
    );

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const hiddenEl = document.createElement("div");
            hiddenEl.style.cssText =
                "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;overflow:hidden;width:0;height:0;";
            document.body.appendChild(hiddenEl);
            try {
                mermaid.registerLayoutLoaders(elkLayouts);
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "loose",
                    theme: "base",
                    themeVariables: ERD_THEME_VARIABLES,
                    layout: "elk",
                    er: {
                        useMaxWidth: false,
                        layoutDirection: "TB",
                    },
                });
                const id = `erd-mermaid-${Date.now()}`;
                const result = await mermaid.render(id, mermaidCode, hiddenEl);
                if (!cancelled) {
                    setSvg(addSvgPadding(result.svg, 40));
                    setRenderError(null);
                }
            } catch {
                if (!cancelled) {
                    setRenderError("Mermaid 렌더링에 실패했습니다.");
                    setSvg("");
                }
            } finally {
                document.body.removeChild(hiddenEl);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [mermaidCode]);

    if (entitiesQuery.isLoading) {
        return (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
                <CircularProgress />
            </Box>
        );
    }

    if (entitiesQuery.error) {
        return (
            <Alert severity="error">
                Mermaid ERD 데이터를 불러오지 못했습니다.
            </Alert>
        );
    }

    return (
        <Paper
            sx={{
                height: "100%",
                display: "flex",
                position: "relative",
            }}
        >
            {/* 왼쪽 엔티티 목록 */}
            <Box
                className="erd-entity-list"
                sx={{
                    width: 220,
                    flexShrink: 0,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    borderRight: "1px solid rgba(0,0,0,0.12)",
                }}
            >
                {/* 목록 툴바 */}
                <Box
                    sx={{
                        px: 1.5,
                        height: 64,
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        borderBottom: "1px solid rgba(0,0,0,0.12)",
                        flexShrink: 0,
                    }}
                >
                    <Typography
                        variant="body2"
                        fontWeight="bold"
                        sx={{ flex: 1 }}
                    >
                        목록
                    </Typography>
                    <IconButton
                        size="small"
                        onClick={() => {
                            setNewEntityName("");
                            setAddDialogOpen(true);
                        }}
                    >
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Box>
                <OverlayScrollbar
                    style={{ flex: 1 }}
                    track={{ alignment: "outside" }}
                >
                    <Box
                        sx={{
                            py: 1,
                            fontFamily: "'D2Coding', monospace",
                            fontSize: "0.9rem",
                        }}
                    >
                        {(entitiesQuery.data || []).map((entity) => (
                            <Box
                                key={entity.name}
                                onClick={() => setKeyword(entity.name)}
                                sx={{
                                    px: 1.5,
                                    py: 0.5,
                                    cursor: "pointer",
                                    bgcolor:
                                        keyword === entity.name
                                            ? "primary.main"
                                            : "transparent",
                                    color:
                                        keyword === entity.name
                                            ? "primary.contrastText"
                                            : "text.primary",
                                    "&:hover": {
                                        bgcolor:
                                            keyword === entity.name
                                                ? "primary.dark"
                                                : "action.hover",
                                    },
                                }}
                            >
                                {entity.name} (
                                {erdCountByEntity[entity.name] ?? 0})
                            </Box>
                        ))}
                    </Box>
                </OverlayScrollbar>
            </Box>

            {/* 오른쪽: 툴바 + ERD */}
            <Box
                sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                }}
            >
                {/* 툴바 */}
                <Box
                    sx={{
                        px: 1.5,
                        height: 64,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        borderBottom: "1px solid rgba(0,0,0,0.12)",
                        flexShrink: 0,
                    }}
                >
                    <Stack direction="row" spacing={2} alignItems="center">
                        <SearchTextField
                            size="small"
                            fullWidth
                            label="엔티티 / 필드명 검색"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onClear={() => setKeyword("")}
                            debounce={0}
                        />
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                                minWidth: 42,
                                textAlign: "right",
                                flexShrink: 0,
                            }}
                        >
                            {Math.round(zoom * 100)}%
                        </Typography>
                        <Slider
                            size="small"
                            min={0.2}
                            max={1.2}
                            step={0.05}
                            value={zoom}
                            onChange={(_, value) => {
                                const nextZoom = value as number;
                                const viewport = getViewport();
                                if (!viewport) {
                                    setZoom(nextZoom);
                                    return;
                                }
                                const pointerX = viewport.clientWidth / 2;
                                const pointerY = viewport.clientHeight / 2;
                                const worldX =
                                    (viewport.scrollLeft + pointerX) / zoom;
                                const worldY =
                                    (viewport.scrollTop + pointerY) / zoom;
                                setZoom(nextZoom);
                                requestAnimationFrame(() => {
                                    viewport.scrollLeft =
                                        worldX * nextZoom - pointerX;
                                    viewport.scrollTop =
                                        worldY * nextZoom - pointerY;
                                });
                            }}
                            sx={{ width: 120, flexShrink: 0 }}
                        />
                        <Button
                            size="small"
                            startIcon={<RestartAltIcon />}
                            onClick={resetView}
                            sx={{ flexShrink: 0 }}
                        >
                            초기화
                        </Button>
                    </Stack>
                </Box>
                {renderError ? (
                    <Alert
                        severity="warning"
                        sx={{ mx: 1.5, my: 0.5, flexShrink: 0 }}
                    >
                        {renderError}
                    </Alert>
                ) : null}

                {/* ERD 뷰포트 */}
                <OverlayScrollbar
                    ref={viewportRef}
                    style={{ flex: 1 }}
                    dragScroll={{ enabled: false }}
                    track={{ alignment: "outside" }}
                >
                    <Box
                        sx={{
                            minWidth: "100%",
                            minHeight: "100%",
                            display: "flex",
                            touchAction: "none",
                            userSelect: "none",
                        }}
                        onWheel={(event) => {
                            event.preventDefault();
                            const viewport = getViewport();
                            if (!viewport) return;

                            const rect = viewport.getBoundingClientRect();
                            const pointerX = event.clientX - rect.left;
                            const pointerY = event.clientY - rect.top;

                            const zoomStep = event.deltaY > 0 ? -0.08 : 0.08;
                            const nextZoom = clampZoom(zoom + zoomStep);
                            if (nextZoom === zoom) return;

                            const worldX =
                                (viewport.scrollLeft + pointerX) / zoom;
                            const worldY =
                                (viewport.scrollTop + pointerY) / zoom;

                            setZoom(nextZoom);
                            requestAnimationFrame(() => {
                                viewport.scrollLeft =
                                    worldX * nextZoom - pointerX;
                                viewport.scrollTop =
                                    worldY * nextZoom - pointerY;
                            });
                        }}
                        onMouseDown={(event) => {
                            if (event.button !== 0) return;
                            const viewport = getViewport();
                            if (!viewport) return;
                            setIsDragging(true);
                            dragStartRef.current = {
                                x: event.clientX,
                                y: event.clientY,
                                scrollLeft: viewport.scrollLeft,
                                scrollTop: viewport.scrollTop,
                            };
                        }}
                        onMouseMove={(event) => {
                            const viewport = getViewport();
                            if (!viewport) return;
                            if (!isDragging) return;
                            const dx = event.clientX - dragStartRef.current.x;
                            const dy = event.clientY - dragStartRef.current.y;
                            viewport.scrollLeft =
                                dragStartRef.current.scrollLeft - dx;
                            viewport.scrollTop =
                                dragStartRef.current.scrollTop - dy;
                        }}
                        onMouseUp={() => setIsDragging(false)}
                        onMouseLeave={() => setIsDragging(false)}
                    >
                        <Box
                            sx={{
                                display: "block",
                                width: "fit-content",
                                margin: "auto",
                                zoom,
                                "& svg": {
                                    display: "block",
                                    textRendering: "geometricPrecision",
                                    shapeRendering: "geometricPrecision",
                                },
                            }}
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    </Box>
                </OverlayScrollbar>
            </Box>

            {/* 엔티티 추가 다이얼로그 */}
            <Dialog
                open={addDialogOpen}
                onClose={() => setAddDialogOpen(false)}
                fullWidth
                maxWidth="xs"
            >
                <DialogTitle>엔티티 추가</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        label="엔티티명"
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && newEntityName.trim()) {
                                setKeyword(newEntityName.trim());
                                setAddDialogOpen(false);
                            }
                        }}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)}>
                        취소
                    </Button>
                    <Button
                        variant="contained"
                        disabled={!newEntityName.trim()}
                        onClick={() => {
                            setKeyword(newEntityName.trim());
                            setAddDialogOpen(false);
                        }}
                    >
                        확인
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default ErdMermaidPage;
