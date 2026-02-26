import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    FormControlLabel,
    Checkbox,
    Paper,
    Slider,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { erdApi } from "../models/api";
import type { ERDEntityMeta } from "../models/types/erd";

type ERDEntity = {
    name: string;
    dbGroup: string;
    moduleKey: string;
    fields: string[];
    fieldTypes: Record<string, string>;
};

type ERDRelation = {
    from: string;
    to: string;
    field: string;
    type: "direct" | "polymorphic";
};

const toModuleKey = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "etc";
    const idx = trimmed.indexOf("_");
    if (idx <= 0) return trimmed;
    return trimmed.slice(0, idx);
};

const normalizeEntity = (raw: ERDEntityMeta): ERDEntity | null => {
    const name = String(raw.name || "").trim();
    if (!name) return null;

    const normalizedFields = (raw.fields || [])
        .map((v) => String(v).trim())
        .filter(Boolean);
    const fields = Array.from(new Set(normalizedFields)).sort((a, b) =>
        a.localeCompare(b),
    );
    const fieldTypes: Record<string, string> = {};
    for (const col of raw.tables?.index?.columns || []) {
        const colName = String(col.name || "").trim();
        if (!colName) continue;
        fieldTypes[colName] = String(col.type || "").trim();
    }
    return {
        name,
        dbGroup: String(raw.db_group || "").trim() || "default",
        moduleKey: toModuleKey(name),
        fields,
        fieldTypes,
    };
};

const inferRelations = (entities: ERDEntity[]): ERDRelation[] => {
    const names = new Set(entities.map((e) => e.name));
    const relations: ERDRelation[] = [];

    for (const entity of entities) {
        const hasRefEntity = entity.fields.includes("ref_entity");
        const hasRefSeq = entity.fields.includes("ref_seq");
        if (hasRefEntity && hasRefSeq) {
            relations.push({
                from: entity.name,
                to: "*",
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

    return relations.sort((a, b) => {
        const first = `${a.from}:${a.field}:${a.to}`;
        const second = `${b.from}:${b.field}:${b.to}`;
        return first.localeCompare(second);
    });
};

const ErdPage = () => {
    const [keyword, setKeyword] = useState("");
    const [scale, setScale] = useState(1);
    const [relationFilter, setRelationFilter] = useState({
        direct: true,
        polymorphic: true,
    });
    const [dbGroupFilter, setDbGroupFilter] = useState("all");
    const [includeDBMeta, setIncludeDBMeta] = useState(false);

    const entitiesQuery = useQuery({
        queryKey: ["erd", "entities", includeDBMeta],
        queryFn: async (): Promise<ERDEntity[]> => {
            const schema = await erdApi.getSchema(includeDBMeta);
            return schema.entities
                .map((item) => normalizeEntity(item))
                .filter((item): item is ERDEntity => Boolean(item))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        staleTime: 30_000,
    });

    const dbGroups = useMemo(() => {
        const set = new Set((entitiesQuery.data || []).map((e) => e.dbGroup));
        return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
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

    const relations = useMemo(() => {
        const inferred = inferRelations(filteredEntities);
        return inferred.filter((rel) => relationFilter[rel.type]);
    }, [filteredEntities, relationFilter]);

    const graph = useMemo(() => {
        const cardW = 260;
        const cardH = 110;
        const colGap = 36;
        const rowGap = 52;
        const cols = Math.max(
            1,
            Math.min(4, Math.ceil(Math.sqrt(filteredEntities.length || 1))),
        );

        const positions = new Map<
            string,
            { x: number; y: number; w: number; h: number }
        >();
        filteredEntities.forEach((entity, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions.set(entity.name, {
                x: col * (cardW + colGap),
                y: row * (cardH + rowGap),
                w: cardW,
                h: cardH,
            });
        });

        const rows = Math.ceil((filteredEntities.length || 1) / cols);
        const width = Math.max(640, cols * cardW + (cols - 1) * colGap + 60);
        const height = Math.max(420, rows * cardH + (rows - 1) * rowGap + 60);
        return { positions, width, height };
    }, [filteredEntities]);

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
                ERD 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
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
                        placeholder="예: approval, account_seq"
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
                    <Chip label={`엔티티 ${filteredEntities.length}`} color="primary" />
                    <Chip label={`관계 ${relations.length}`} />
                </Stack>
                <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap" }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={relationFilter.direct}
                                onChange={(e) =>
                                    setRelationFilter((prev) => ({
                                        ...prev,
                                        direct: e.target.checked,
                                    }))
                                }
                            />
                        }
                        label="direct 관계"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={relationFilter.polymorphic}
                                onChange={(e) =>
                                    setRelationFilter((prev) => ({
                                        ...prev,
                                        polymorphic: e.target.checked,
                                    }))
                                }
                            />
                        }
                        label="polymorphic 관계"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={includeDBMeta}
                                onChange={(e) =>
                                    setIncludeDBMeta(e.target.checked)
                                }
                            />
                        }
                        label="DB 메타 보강(read-only)"
                    />
                    <Box sx={{ width: 200, display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Zoom
                        </Typography>
                        <Slider
                            min={0.6}
                            max={1.6}
                            step={0.1}
                            value={scale}
                            onChange={(_, v) => setScale(Number(v))}
                            valueLabelDisplay="auto"
                        />
                    </Box>
                </Stack>
            </Paper>

            <Box sx={{ flex: 1, minHeight: 0, display: "grid", gap: 2, gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)" }}>
                <Paper sx={{ p: 2, overflow: "auto" }}>
                    <Typography variant="h6" sx={{ mb: 1.5 }}>
                        Entities
                    </Typography>
                    <Stack spacing={1.5}>
                        {filteredEntities.map((entity) => (
                            <Box
                                key={entity.name}
                                sx={{
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1.5,
                                    p: 1.25,
                                }}
                            >
                                <Typography fontWeight={700} sx={{ mb: 1 }}>
                                    {entity.name}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block", mb: 1 }}
                                >
                                    db_group: {entity.dbGroup} / module: {entity.moduleKey}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                                    {entity.fields.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            index 필드 없음
                                        </Typography>
                                    ) : (
                                        entity.fields.map((field) => (
                                            <Chip key={field} size="small" label={field} />
                                        ))
                                    )}
                                </Box>
                            </Box>
                        ))}
                    </Stack>
                </Paper>

                <Paper sx={{ p: 2, overflow: "auto" }}>
                    <Typography variant="h6" sx={{ mb: 1.5 }}>
                        Diagram
                    </Typography>
                    <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1 }}>
                        <Box
                            sx={{
                                width: `${graph.width}px`,
                                height: `${graph.height}px`,
                                transform: `scale(${scale})`,
                                transformOrigin: "0 0",
                                position: "relative",
                                background:
                                    "linear-gradient(0deg, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
                                backgroundSize: "20px 20px",
                            }}
                        >
                            <svg
                                width={graph.width}
                                height={graph.height}
                                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                            >
                                {relations.map((rel) => {
                                    const from = graph.positions.get(rel.from);
                                    const to = graph.positions.get(rel.to);
                                    if (!from || !to) return null;
                                    const x1 = from.x + from.w;
                                    const y1 = from.y + from.h / 2;
                                    const x2 = to.x;
                                    const y2 = to.y + to.h / 2;
                                    const cx = (x1 + x2) / 2;
                                    const path = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                                    return (
                                        <g key={`${rel.from}-${rel.field}-${rel.to}`}>
                                            <path
                                                d={path}
                                                fill="none"
                                                stroke={
                                                    rel.type === "polymorphic"
                                                        ? "#ed6c02"
                                                        : "#64748b"
                                                }
                                                strokeWidth={2}
                                                strokeDasharray={
                                                    rel.type === "polymorphic"
                                                        ? "6 4"
                                                        : undefined
                                                }
                                            />
                                        </g>
                                    );
                                })}
                            </svg>

                            {filteredEntities.map((entity) => {
                                const pos = graph.positions.get(entity.name);
                                if (!pos) return null;
                                return (
                                    <Box
                                        key={entity.name}
                                        sx={{
                                            position: "absolute",
                                            left: pos.x,
                                            top: pos.y,
                                            width: pos.w,
                                            height: pos.h,
                                            bgcolor: "background.paper",
                                            border: "1px solid",
                                            borderColor: "divider",
                                            borderRadius: 1.5,
                                            p: 1,
                                            overflow: "hidden",
                                        }}
                                    >
                                        <Typography fontWeight={700} fontSize={13}>
                                            {entity.name}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ display: "block", mb: 0.75 }}
                                        >
                                            {entity.dbGroup}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {(entity.fields.length
                                                ? entity.fields
                                                      .map((field) => {
                                                          const t =
                                                              entity.fieldTypes[
                                                                  field
                                                              ];
                                                          return t
                                                              ? `${field}:${t}`
                                                              : field;
                                                      })
                                                      .join(", ")
                                                : "index 필드 없음")}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
};

export default ErdPage;
