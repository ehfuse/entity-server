import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    IconButton,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    Remove as RemoveIcon,
    RestartAlt as RestartAltIcon,
} from "@mui/icons-material";
import mermaid from "mermaid";
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

const normalizeEntity = (raw: ERDEntityMeta): ERDEntity | null => {
    const name = String(raw.name || "").trim();
    if (!name) return null;

    const fields = Array.from(
        new Set((raw.fields || []).map((v) => String(v).trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    const fieldTypes: Record<string, string> = {};
    for (const col of raw.tables?.index?.columns || []) {
        const colName = String(col.name || "").trim();
        if (!colName) continue;
        fieldTypes[colName] = String(col.type || "").trim();
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
            if (field === "seq" || !field.endsWith("_seq")) continue;
            const target = field.slice(0, -4);
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
        `${a.from}:${a.field}:${a.to}`.localeCompare(`${b.from}:${b.field}:${b.to}`),
    );
};

const buildMermaidERD = (
    entities: ERDEntity[],
    relations: ERDRelation[],
    includeTypes: boolean,
) => {
    const lines: string[] = ["erDiagram"];

    for (const rel of relations) {
        const right = rel.type === "polymorphic" ? "}|..||" : "}|--||";
        lines.push(
            `  ${rel.from} ${right} ${rel.to} : "${rel.field.replace(/"/g, '\\"')}"`,
        );
    }

    for (const entity of entities) {
        lines.push(`  ${entity.name} {`);
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

const ErdMermaidPage = () => {
    const [keyword, setKeyword] = useState("");
    const [dbGroupFilter, setDbGroupFilter] = useState("all");
    const [includeDBMeta, setIncludeDBMeta] = useState(false);
    const [includeTypes, setIncludeTypes] = useState(true);
    const [svg, setSvg] = useState("");
    const [renderError, setRenderError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [isDragging, setIsDragging] = useState(false);

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    const clampZoom = (value: number) => Math.max(0.2, Math.min(8, value));
    const resetView = () => {
        setZoom(1);
        const viewport = viewportRef.current;
        if (viewport) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
    };

    const entitiesQuery = useQuery({
        queryKey: ["erd", "mermaid", includeDBMeta],
        queryFn: async (): Promise<ERDEntity[]> => {
            const schema = await erdApi.getSchema(includeDBMeta);
            return schema.entities
                .map(normalizeEntity)
                .filter((v): v is ERDEntity => Boolean(v))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        staleTime: 30_000,
    });

    const dbGroups = useMemo(() => {
        const values = new Set((entitiesQuery.data || []).map((e) => e.dbGroup));
        return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
    }, [entitiesQuery.data]);

    const filteredEntities = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        const all = entitiesQuery.data || [];
        return all.filter((entity) => {
            if (dbGroupFilter !== "all" && entity.dbGroup !== dbGroupFilter) {
                return false;
            }
            if (!q) return true;
            if (entity.name.toLowerCase().includes(q)) return true;
            return entity.fields.some((field) => field.toLowerCase().includes(q));
        });
    }, [dbGroupFilter, entitiesQuery.data, keyword]);

    const relations = useMemo(
        () => inferRelations(filteredEntities),
        [filteredEntities],
    );

    const mermaidCode = useMemo(
        () => buildMermaidERD(filteredEntities, relations, includeTypes),
        [filteredEntities, relations, includeTypes],
    );

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "loose",
                    theme: "default",
                    er: { useMaxWidth: true },
                });
                const id = `erd-mermaid-${Date.now()}`;
                const result = await mermaid.render(id, mermaidCode);
                if (!cancelled) {
                    setSvg(result.svg);
                    setRenderError(null);
                }
            } catch {
                if (!cancelled) {
                    setRenderError("Mermaid 렌더링에 실패했습니다.");
                    setSvg("");
                }
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
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
            <Paper sx={{ p: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                        size="small"
                        fullWidth
                        label="엔티티/필드 검색"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                    />
                    <TextField
                        select
                        size="small"
                        label="DB Group"
                        value={dbGroupFilter}
                        onChange={(e) => setDbGroupFilter(e.target.value)}
                        sx={{ minWidth: 160 }}
                    >
                        {dbGroups.map((group) => (
                            <option key={group} value={group}>
                                {group}
                            </option>
                        ))}
                    </TextField>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap" }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={includeDBMeta}
                                onChange={(e) => setIncludeDBMeta(e.target.checked)}
                            />
                        }
                        label="DB 메타 보강(read-only)"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={includeTypes}
                                onChange={(e) => setIncludeTypes(e.target.checked)}
                            />
                        }
                        label="필드 타입 표시"
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                        엔티티 {filteredEntities.length} / 관계 {relations.length}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                        <IconButton
                            size="small"
                            onClick={() => {
                                const viewport = viewportRef.current;
                                const nextZoom = clampZoom(zoom - 0.1);
                                if (!viewport || nextZoom === zoom) {
                                    setZoom(nextZoom);
                                    return;
                                }
                                const pointerX = viewport.clientWidth / 2;
                                const pointerY = viewport.clientHeight / 2;
                                const worldX = (viewport.scrollLeft + pointerX) / zoom;
                                const worldY = (viewport.scrollTop + pointerY) / zoom;
                                setZoom(nextZoom);
                                requestAnimationFrame(() => {
                                    viewport.scrollLeft = worldX * nextZoom - pointerX;
                                    viewport.scrollTop = worldY * nextZoom - pointerY;
                                });
                            }}
                        >
                            <RemoveIcon fontSize="small" />
                        </IconButton>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ minWidth: 58, textAlign: "center" }}
                        >
                            {Math.round(zoom * 100)}%
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => {
                                const viewport = viewportRef.current;
                                const nextZoom = clampZoom(zoom + 0.1);
                                if (!viewport || nextZoom === zoom) {
                                    setZoom(nextZoom);
                                    return;
                                }
                                const pointerX = viewport.clientWidth / 2;
                                const pointerY = viewport.clientHeight / 2;
                                const worldX = (viewport.scrollLeft + pointerX) / zoom;
                                const worldY = (viewport.scrollTop + pointerY) / zoom;
                                setZoom(nextZoom);
                                requestAnimationFrame(() => {
                                    viewport.scrollLeft = worldX * nextZoom - pointerX;
                                    viewport.scrollTop = worldY * nextZoom - pointerY;
                                });
                            }}
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                        <Button
                            size="small"
                            startIcon={<RestartAltIcon />}
                            onClick={resetView}
                        >
                            리셋
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {renderError ? <Alert severity="warning">{renderError}</Alert> : null}

            <Paper sx={{ p: 2, flex: 1, minHeight: 0 }}>
                <Box
                    ref={viewportRef}
                    sx={{
                        width: "100%",
                        height: "100%",
                        overflow: "auto",
                        position: "relative",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1.5,
                        cursor: isDragging ? "grabbing" : "grab",
                        touchAction: "none",
                        userSelect: "none",
                    }}
                    onWheel={(event) => {
                        event.preventDefault();
                        const viewport = viewportRef.current;
                        if (!viewport) return;

                        const rect = viewport.getBoundingClientRect();
                        const pointerX = event.clientX - rect.left;
                        const pointerY = event.clientY - rect.top;

                        const zoomStep = event.deltaY > 0 ? -0.08 : 0.08;
                        const nextZoom = clampZoom(zoom + zoomStep);
                        if (nextZoom === zoom) return;

                        const worldX = (viewport.scrollLeft + pointerX) / zoom;
                        const worldY = (viewport.scrollTop + pointerY) / zoom;

                        setZoom(nextZoom);
                        requestAnimationFrame(() => {
                            viewport.scrollLeft = worldX * nextZoom - pointerX;
                            viewport.scrollTop = worldY * nextZoom - pointerY;
                        });
                    }}
                    onMouseDown={(event) => {
                        if (event.button !== 0) return;
                        const viewport = viewportRef.current;
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
                        const viewport = viewportRef.current;
                        if (!viewport) return;
                        if (!isDragging) return;
                        const dx = event.clientX - dragStartRef.current.x;
                        const dy = event.clientY - dragStartRef.current.y;
                        viewport.scrollLeft = dragStartRef.current.scrollLeft - dx;
                        viewport.scrollTop = dragStartRef.current.scrollTop - dy;
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                >
                    <Box
                        sx={{
                            minWidth: "max-content",
                            "& svg": {
                                width: `${zoom * 100}%`,
                                height: "auto",
                                maxWidth: "none",
                                display: "block",
                                textRendering: "geometricPrecision",
                                shapeRendering: "geometricPrecision",
                            },
                        }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                    <Box
                        sx={{
                            position: "sticky",
                            right: 8,
                            bottom: 8,
                            ml: "auto",
                            width: "fit-content",
                            px: 1,
                            py: 0.5,
                            bgcolor: "rgba(255,255,255,0.85)",
                            borderRadius: 1,
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <Typography variant="caption" color="text.secondary">
                            휠: 확대/축소, 드래그: 이동
                        </Typography>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
};

export default ErdMermaidPage;
