import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Alert,
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import {
    Background,
    Controls,
    MarkerType,
    MiniMap,
    Panel,
    ReactFlow,
    type Edge,
    type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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

    return {
        name,
        dbGroup: String(raw.db_group || "").trim() || "default",
        moduleKey: toModuleKey(name),
        fields: (raw.fields || []).map((v) => String(v)).filter(Boolean),
        fieldTypes: Object.fromEntries(
            (raw.tables?.index?.columns || [])
                .map((col) => [String(col.name || "").trim(), String(col.type || "").trim()])
                .filter(([k]) => Boolean(k)),
        ),
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

    return relations;
};

const ErdFlow2Page = () => {
    const [keyword, setKeyword] = useState("");
    const [dbGroupFilter, setDbGroupFilter] = useState("all");
    const [includeDBMeta, setIncludeDBMeta] = useState(false);
    const [includeTypes, setIncludeTypes] = useState(true);
    const [relationFilter, setRelationFilter] = useState({
        direct: true,
        polymorphic: true,
    });
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [focusMode, setFocusMode] = useState<"all" | "1hop" | "2hop">("all");
    const [collapsedEntities, setCollapsedEntities] = useState<string[]>([]);

    const schemaQuery = useQuery({
        queryKey: ["erd", "flow2", includeDBMeta],
        queryFn: () => erdApi.getSchema(includeDBMeta),
        staleTime: 30_000,
    });

    const entities = useMemo(
        () =>
            (schemaQuery.data?.entities || [])
                .map(normalizeEntity)
                .filter((v): v is ERDEntity => Boolean(v))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [schemaQuery.data],
    );

    const dbGroups = useMemo(() => {
        const values = new Set(entities.map((e) => e.dbGroup));
        return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
    }, [entities]);

    const filteredEntities = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        return entities.filter((entity) => {
            if (dbGroupFilter !== "all" && entity.dbGroup !== dbGroupFilter) {
                return false;
            }
            if (collapsedEntities.includes(entity.name)) {
                return false;
            }
            if (!q) return true;
            if (entity.name.toLowerCase().includes(q)) return true;
            return entity.fields.some((field) => field.toLowerCase().includes(q));
        });
    }, [collapsedEntities, dbGroupFilter, entities, keyword]);

    const relations = useMemo(() => {
        const inferred = inferRelations(filteredEntities);
        return inferred.filter((rel) => relationFilter[rel.type]);
    }, [filteredEntities, relationFilter]);

    const focusEntityNames = useMemo(() => {
        const depth = focusMode === "all" ? 0 : focusMode === "1hop" ? 1 : 2;
        if (depth === 0 || !selectedNodeId) return null;

        const adjacency = new Map<string, Set<string>>();
        const ensure = (name: string) => {
            if (!adjacency.has(name)) adjacency.set(name, new Set());
            return adjacency.get(name)!;
        };
        for (const rel of relations) {
            ensure(rel.from).add(rel.to);
            ensure(rel.to).add(rel.from);
        }

        const visited = new Set<string>([selectedNodeId]);
        let frontier = new Set<string>([selectedNodeId]);
        for (let i = 0; i < depth; i++) {
            const next = new Set<string>();
            for (const node of frontier) {
                for (const neighbor of adjacency.get(node) || []) {
                    if (visited.has(neighbor)) continue;
                    visited.add(neighbor);
                    next.add(neighbor);
                }
            }
            frontier = next;
            if (frontier.size === 0) break;
        }
        return visited;
    }, [focusMode, relations, selectedNodeId]);

    const { nodes, edges, viewEntities } = useMemo(() => {
        const hasPolymorphic = relations.some((rel) => rel.type === "polymorphic");
        const allViewEntities = hasPolymorphic
            ? [
                  ...filteredEntities,
                  {
                      name: "ANY_ENTITY",
                      dbGroup: "polymorphic",
                      moduleKey: "polymorphic",
                      fields: ["target"],
                      fieldTypes: {} as Record<string, string>,
                  } satisfies ERDEntity,
              ]
            : filteredEntities;

        const viewEntities =
            focusEntityNames == null
                ? allViewEntities
                : allViewEntities.filter((entity) => focusEntityNames.has(entity.name));

        const visibleRelations =
            focusEntityNames == null
                ? relations
                : relations.filter(
                      (rel) =>
                          focusEntityNames.has(rel.from) && focusEntityNames.has(rel.to),
                  );

        const isSelected = (name: string) => selectedNodeId === name;
        const isConnected = (name: string) =>
            visibleRelations.some((r) => r.from === name || r.to === name);
        const relatedToSelection = (name: string) =>
            selectedNodeId == null ||
            name === selectedNodeId ||
            visibleRelations.some(
                (r) =>
                    (r.from === selectedNodeId && r.to === name) ||
                    (r.to === selectedNodeId && r.from === name),
            );

        const cols = Math.max(1, Math.ceil(Math.sqrt(viewEntities.length || 1)));
        const cardW = 260;
        const cardH = 130;
        const gapX = 80;
        const gapY = 80;

        const nodes: Node[] = viewEntities.map((entity, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
                id: entity.name,
                position: {
                    x: col * (cardW + gapX),
                    y: row * (cardH + gapY),
                },
                data: {
                    label: (
                        <Box>
                            <Typography fontWeight={700} fontSize={13}>
                                {entity.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {entity.dbGroup}
                            </Typography>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                    mt: 0.5,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {(entity.fields.length
                                    ? entity.fields
                                          .map((field) => {
                                              if (!includeTypes) return field;
                                              const type = entity.fieldTypes[field];
                                              return type ? `${field}:${type}` : field;
                                          })
                                          .join(", ")
                                    : "index 필드 없음")}
                            </Typography>
                        </Box>
                    ),
                },
                style: {
                    width: cardW,
                    minHeight: cardH,
                    borderRadius: 10,
                    border:
                        entity.name === "ANY_ENTITY"
                            ? "1px dashed #d97706"
                            : "1px solid #d1d5db",
                    background: isSelected(entity.name) ? "#eff6ff" : "#fff",
                    padding: 10,
                    opacity: relatedToSelection(entity.name) ? 1 : 0.35,
                    boxShadow: isSelected(entity.name)
                        ? "0 0 0 2px rgba(37, 99, 235, 0.25)"
                        : isConnected(entity.name)
                          ? "0 1px 4px rgba(2,6,23,0.08)"
                          : undefined,
                },
            };
        });

        const edges: Edge[] = visibleRelations.map((rel, idx) => ({
            id: `e-${rel.from}-${rel.to}-${idx}`,
            source: rel.from,
            target: rel.to,
            label: rel.field,
            markerEnd: { type: MarkerType.ArrowClosed },
            type: "smoothstep",
            style: {
                strokeWidth:
                    selectedNodeId != null &&
                    (rel.from === selectedNodeId || rel.to === selectedNodeId)
                        ? 2.4
                        : 1.4,
                stroke: rel.type === "polymorphic" ? "#d97706" : undefined,
                strokeDasharray: rel.type === "polymorphic" ? "6 4" : undefined,
                opacity:
                    selectedNodeId == null ||
                    rel.from === selectedNodeId ||
                    rel.to === selectedNodeId
                        ? 1
                        : 0.2,
            },
            labelStyle: { fontSize: 11 },
        }));

        return { nodes, edges, viewEntities };
    }, [
        filteredEntities,
        focusEntityNames,
        includeTypes,
        relations,
        selectedNodeId,
    ]);

    const selectedEntity = useMemo(
        () => viewEntities.find((entity) => entity.name === selectedNodeId) || null,
        [selectedNodeId, viewEntities],
    );

    const selectedRelations = useMemo(() => {
        if (!selectedNodeId) return [];
        return edges
            .map((edge) => ({
                from: String(edge.source),
                to: String(edge.target),
                field: String(edge.label || ""),
            }))
            .filter(
                (rel) => rel.from === selectedNodeId || rel.to === selectedNodeId,
            );
    }, [edges, selectedNodeId]);

    const toggleEntityCollapse = (entityName: string) => {
        setCollapsedEntities((prev) =>
            prev.includes(entityName)
                ? prev.filter((item) => item !== entityName)
                : [...prev, entityName],
        );
    };

    const visibleEntityCount = useMemo(() => viewEntities.length, [viewEntities]);
    const relationCount = useMemo(() => edges.length, [edges]);
    const focusSummary = useMemo(() => {
        if (!selectedNodeId || focusMode === "all") return "전체";
        if (focusMode === "1hop") return "선택 기준 1-hop";
        return "선택 기준 2-hop";
    }, [focusMode, selectedNodeId]);

    if (schemaQuery.isLoading) {
        return (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
                <CircularProgress />
            </Box>
        );
    }

    if (schemaQuery.error) {
        return <Alert severity="error">React Flow ERD 데이터를 불러오지 못했습니다.</Alert>;
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
                    <Chip label={`엔티티 ${visibleEntityCount}`} color="primary" />
                    <Chip label={`관계 ${relationCount}`} />
                    <Chip size="small" variant="outlined" label={focusSummary} />
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
                    <TextField
                        select
                        size="small"
                        label="포커스"
                        value={focusMode}
                        onChange={(e) =>
                            setFocusMode(e.target.value as "all" | "1hop" | "2hop")
                        }
                        sx={{ minWidth: 140 }}
                    >
                        <option value="all">전체</option>
                        <option value="1hop">선택 1-hop</option>
                        <option value="2hop">선택 2-hop</option>
                    </TextField>
                </Stack>
            </Paper>

            <Box
                sx={{
                    height: "100%",
                    minHeight: 0,
                    flex: 1,
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: "minmax(0, 1fr) 320px",
                }}
            >
                <Paper sx={{ minHeight: 0, overflow: "hidden" }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        minZoom={0.2}
                        maxZoom={3}
                        proOptions={{ hideAttribution: true }}
                        onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
                        onPaneClick={() => setSelectedNodeId(null)}
                    >
                        <Panel position="top-right">
                            <Chip size="small" label="ERD Flow 2" color="info" />
                        </Panel>
                        <MiniMap zoomable pannable />
                        <Controls />
                        <Background gap={20} size={1} />
                    </ReactFlow>
                </Paper>

                <Paper sx={{ p: 2, minHeight: 0, overflow: "auto" }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                        선택 엔티티
                    </Typography>
                    {!selectedEntity ? (
                        <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                            <Typography variant="body2" color="text.secondary">
                                Flow에서 엔티티를 클릭하면 상세 정보로 전환됩니다.
                            </Typography>
                            {entities
                                .filter(
                                    (entity) =>
                                        dbGroupFilter === "all" ||
                                        entity.dbGroup === dbGroupFilter,
                                )
                                .filter((entity) => {
                                    const q = keyword.trim().toLowerCase();
                                    if (!q) return true;
                                    if (entity.name.toLowerCase().includes(q)) return true;
                                    return entity.fields.some((field) =>
                                        field.toLowerCase().includes(q),
                                    );
                                })
                                .map((entity) => {
                                    const collapsed = collapsedEntities.includes(entity.name);
                                    return (
                                <Box
                                    key={entity.name}
                                    sx={{
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 1.5,
                                        p: 1.25,
                                        cursor: "pointer",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            backgroundColor: "action.hover",
                                        },
                                    }}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                        spacing={1}
                                    >
                                        <Typography
                                            fontWeight={700}
                                            fontSize={13}
                                            onClick={() => {
                                                if (!collapsed) setSelectedNodeId(entity.name);
                                            }}
                                            sx={{ cursor: collapsed ? "default" : "pointer" }}
                                        >
                                            {entity.name}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            variant={collapsed ? "filled" : "outlined"}
                                            color={collapsed ? "default" : "primary"}
                                            label={collapsed ? "펼치기" : "접기"}
                                            onClick={() => toggleEntityCollapse(entity.name)}
                                        />
                                    </Stack>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ display: "block", mt: 0.25 }}
                                    >
                                        db_group: {entity.dbGroup}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                            mt: 0.5,
                                            opacity: collapsed ? 0.5 : 1,
                                        }}
                                    >
                                        {(entity.fields.length
                                            ? entity.fields
                                                  .map((field) => {
                                                      if (!includeTypes) return field;
                                                      const t = entity.fieldTypes[field];
                                                      return t ? `${field}:${t}` : field;
                                                  })
                                                  .join(", ")
                                            : "index 필드 없음")}
                                    </Typography>
                                </Box>
                                    );
                                })}
                        </Stack>
                    ) : (
                        <Stack spacing={1.5} sx={{ mt: 1 }}>
                            <Chip
                                size="small"
                                color="primary"
                                label={selectedEntity.name}
                                sx={{ width: "fit-content" }}
                            />
                            <Chip
                                size="small"
                                variant="outlined"
                                label="선택 해제"
                                onClick={() => setSelectedNodeId(null)}
                                sx={{ width: "fit-content" }}
                            />
                            <Chip
                                size="small"
                                variant={
                                    collapsedEntities.includes(selectedEntity.name)
                                        ? "filled"
                                        : "outlined"
                                }
                                color={
                                    collapsedEntities.includes(selectedEntity.name)
                                        ? "default"
                                        : "primary"
                                }
                                label={
                                    collapsedEntities.includes(selectedEntity.name)
                                        ? "펼치기"
                                        : "접기"
                                }
                                onClick={() => toggleEntityCollapse(selectedEntity.name)}
                                sx={{ width: "fit-content" }}
                            />
                            <Typography variant="body2" color="text.secondary">
                                db_group: {selectedEntity.dbGroup}
                            </Typography>

                            <Box>
                                <Typography variant="subtitle2">필드</Typography>
                                <Stack
                                    direction="row"
                                    spacing={0.75}
                                    useFlexGap
                                    flexWrap="wrap"
                                    sx={{ mt: 0.75 }}
                                >
                                    {selectedEntity.fields.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            index 필드 없음
                                        </Typography>
                                    ) : (
                                        selectedEntity.fields.map((field) => (
                                            <Chip
                                                key={field}
                                                size="small"
                                                label={
                                                    includeTypes &&
                                                    selectedEntity.fieldTypes[field]
                                                        ? `${field}:${selectedEntity.fieldTypes[field]}`
                                                        : field
                                                }
                                            />
                                        ))
                                    )}
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="subtitle2">관계</Typography>
                                <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                                    {selectedRelations.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            연결된 관계가 없습니다.
                                        </Typography>
                                    ) : (
                                        selectedRelations.map((rel) => (
                                            <Typography
                                                key={`${rel.from}-${rel.field}-${rel.to}`}
                                                variant="body2"
                                            >
                                                {rel.from} ({rel.field}) {"->"} {rel.to}
                                            </Typography>
                                        ))
                                    )}
                                </Stack>
                            </Box>
                        </Stack>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default ErdFlow2Page;
