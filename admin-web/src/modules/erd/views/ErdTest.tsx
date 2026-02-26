import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, CircularProgress } from "@mui/material";
import Masonry from "@mui/lab/Masonry";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import { erdApi } from "../models/api";
import type { ERDEntityMeta } from "../models/types/erd";
import {
    ErdEntityCard,
    type EntityIndexField,
    type InferredFKField,
} from "../components/ErdEntityCard";
import {
    buildRoutingGraph,
    findShortestPath,
    getPathSegments,
    buildOffsetSegments,
    applySegmentOffsets,
    snapOrthogonal,
    pathToSvgPath,
    OBSTACLE_PAD,
} from "../utils/pathFinding";

type ErdEntityCardItem = {
    name: string;
    fkFields: InferredFKField[];
    indexFields: EntityIndexField[];
};

type CardPosition = {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** FK 출발점: fieldName → 타깃과 가까운 쪽 카드 경계의 좌표 */
    fkFieldPositions: Map<string, { x: number; y: number }>;
    /** seq 도착점: sourceEntityName → 소스와 가까운 쪽 카드 경계의 좌표 */
    seqAnchorPositions: Map<string, { x: number; y: number }>;
};

const MASONRY_SPACING = 16; // MUI Masonry spacing 단위 (px 변환: * 8)
const MASONRY_CARD_WIDTH = 240; // 카드 고정 너비 (px)

const normalizeEntityName = (value: string): string =>
    String(value || "").trim();

const inferFKFields = (
    raw: ERDEntityMeta,
    entityNames: Set<string>,
): InferredFKField[] => {
    const indexFieldNames = Array.from(
        new Set((raw.fields || []).map((field) => String(field || "").trim())),
    ).filter(Boolean);

    const fkFields = indexFieldNames
        .filter((field) => field !== "seq" && field.endsWith("_seq"))
        .map((field) => ({
            field,
            targetEntity: field.slice(0, -4),
        }))
        .filter(
            (item) => item.targetEntity && entityNames.has(item.targetEntity),
        )
        .sort((a, b) => a.field.localeCompare(b.field));

    return fkFields;
};

const getIndexFields = (raw: ERDEntityMeta): EntityIndexField[] => {
    const uniqueFields = new Set(
        (raw.unique_fields || [])
            .map((field) => String(field || "").trim())
            .filter(Boolean),
    );

    return Array.from(
        new Set((raw.fields || []).map((field) => String(field || "").trim())),
    )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
            name,
            isUnique: uniqueFields.has(name),
        }));
};

// FK 관계 기반 그룹화 및 정렬
const groupAndSortByFKRelations = (
    items: ErdEntityCardItem[],
): ErdEntityCardItem[] => {
    if (items.length === 0) return items;

    // 양방향 인접 리스트 구축
    const adjacency = new Map<string, Set<string>>();
    items.forEach((item) => {
        if (!adjacency.has(item.name)) {
            adjacency.set(item.name, new Set());
        }
        item.fkFields.forEach((fk) => {
            adjacency.get(item.name)!.add(fk.targetEntity);
            if (!adjacency.has(fk.targetEntity)) {
                adjacency.set(fk.targetEntity, new Set());
            }
            adjacency.get(fk.targetEntity)!.add(item.name);
        });
    });

    // 연결된 컴포넌트 찾기 (BFS)
    const visited = new Set<string>();
    const components: string[][] = [];

    items.forEach((item) => {
        if (visited.has(item.name)) return;

        const component: string[] = [];
        const queue: string[] = [item.name];
        visited.add(item.name);

        while (queue.length > 0) {
            const current = queue.shift()!;
            component.push(current);

            const neighbors = adjacency.get(current) || new Set();
            neighbors.forEach((neighbor) => {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }

        components.push(component);
    });

    // 컴포넌트를 크기 순으로 정렬 (큰 그룹 먼저)
    components.sort((a, b) => b.length - a.length);

    // 각 컴포넌트 내에서 중심성 기반 정렬
    const sortedNames: string[] = [];
    components.forEach((component) => {
        // 가장 많은 연결을 가진 노드부터 BFS
        const degreeMap = new Map<string, number>();
        component.forEach((name) => {
            const degree = (adjacency.get(name) || new Set()).size;
            degreeMap.set(name, degree);
        });

        const sortedComponent = [...component].sort(
            (a, b) => degreeMap.get(b)! - degreeMap.get(a)!,
        );

        // BFS로 재정렬 (중심 노드부터 퍼져나가는 순서)
        const bfsOrder: string[] = [];
        const bfsVisited = new Set<string>();
        const startNode = sortedComponent[0];
        const bfsQueue: string[] = [startNode];
        bfsVisited.add(startNode);

        while (bfsQueue.length > 0) {
            const current = bfsQueue.shift()!;
            bfsOrder.push(current);

            const neighbors = Array.from(adjacency.get(current) || []);
            neighbors.sort((a, b) => {
                const degA = degreeMap.get(a) || 0;
                const degB = degreeMap.get(b) || 0;
                return degB - degA;
            });

            neighbors.forEach((neighbor) => {
                if (!bfsVisited.has(neighbor) && component.includes(neighbor)) {
                    bfsVisited.add(neighbor);
                    bfsQueue.push(neighbor);
                }
            });
        }

        sortedNames.push(...bfsOrder);
    });

    // 최종 정렬된 아이템 배열 생성
    const itemMap = new Map(items.map((item) => [item.name, item]));
    return sortedNames.map((name) => itemMap.get(name)!).filter(Boolean);
};

export default function ErdTest() {
    const containerRef = useRef<HTMLDivElement>(null);
    const masonryHostRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [cardPositions, setCardPositions] = useState<
        Map<string, CardPosition>
    >(new Map());
    const [masonryColumns, setMasonryColumns] = useState(1);

    const schemaQuery = useQuery({
        queryKey: ["erd", "test", "cards"],
        queryFn: () => erdApi.getSchema(false),
        staleTime: 30_000,
    });

    const cardItems = useMemo<ErdEntityCardItem[]>(() => {
        const entities = schemaQuery.data?.entities || [];
        const entityNames = new Set(
            entities
                .map((entity) => normalizeEntityName(entity.name))
                .filter(Boolean),
        );

        const items = entities
            .map((entity) => {
                const name = normalizeEntityName(entity.name);
                if (!name) return null;
                return {
                    name,
                    fkFields: inferFKFields(entity, entityNames),
                    indexFields: getIndexFields(entity),
                };
            })
            .filter((item): item is ErdEntityCardItem => Boolean(item));

        // FK 관계 기반으로 그룹화 및 정렬
        return groupAndSortByFKRelations(items);
    }, [schemaQuery.data]);

    // 카드 위치 계산
    useEffect(() => {
        if (!containerRef.current || cardItems.length === 0) return;

        const updatePositions = () => {
            const positions = new Map<string, CardPosition>();
            const containerRect = containerRef.current!.getBoundingClientRect();

            // Pass 1: 모든 카드의 기본 rect 수집
            const basicRects = new Map<string, DOMRect>();
            cardRefs.current.forEach((cardEl, name) => {
                if (cardEl)
                    basicRects.set(name, cardEl.getBoundingClientRect());
            });

            // 카드 중심 X 헬퍼
            const centerX = (name: string) => {
                const r = basicRects.get(name);
                return r ? r.left + r.width / 2 : 0;
            };

            // Pass 2: 관계를 고려한 접속점 계산
            cardRefs.current.forEach((cardEl, name) => {
                if (!cardEl) return;
                const rect = basicRects.get(name)!;
                const myCenterX = rect.left + rect.width / 2;

                // FK 필드 出발점: 타깃 엔티티가 왼쪽이면 left, 오른쪽이면 right
                const fkFieldPositions = new Map<
                    string,
                    { x: number; y: number }
                >();

                const fkElements = cardEl.querySelectorAll("[data-fk-field]");
                fkElements.forEach((el) => {
                    const fieldName = el.getAttribute("data-fk-field");
                    if (!fieldName) return;
                    const fieldRect = el.getBoundingClientRect();
                    // data-fk-target 속성에서 실제 타깃 엔티티를 읽음 (휴리스틱 제거)
                    const targetEntity =
                        el.getAttribute("data-fk-target") ?? null;
                    const targetCenterX = targetEntity
                        ? centerX(targetEntity)
                        : null;
                    const x =
                        targetCenterX !== null && targetCenterX < myCenterX
                            ? rect.left - containerRect.left // 타깃이 왼쪽
                            : rect.right - containerRect.left; // 타깃이 오른쪽
                    fkFieldPositions.set(fieldName, {
                        x,
                        y:
                            fieldRect.top +
                            fieldRect.height / 2 -
                            containerRect.top,
                    });
                });

                // seq 도착점: 소스 엔티티별로 소스가 왼쪽이면 left, 오른쪽이면 right
                const seqElement = cardEl.querySelector("[data-seq-field]");
                const seqY = seqElement
                    ? seqElement.getBoundingClientRect().top +
                      seqElement.getBoundingClientRect().height / 2 -
                      containerRect.top
                    : rect.top + rect.height / 2 - containerRect.top;

                const seqAnchorPositions = new Map<
                    string,
                    { x: number; y: number }
                >();
                cardItems.forEach((item) => {
                    item.fkFields.forEach((fk) => {
                        if (fk.targetEntity !== name) return;
                        const sourceCenterX = centerX(item.name);
                        const x =
                            sourceCenterX < myCenterX
                                ? rect.left - containerRect.left // 소스가 왼쪽
                                : rect.right - containerRect.left; // 소스가 오른쪽
                        seqAnchorPositions.set(item.name, { x, y: seqY });
                    });
                });

                positions.set(name, {
                    name,
                    x: rect.left - containerRect.left,
                    y: rect.top - containerRect.top,
                    width: rect.width,
                    height: rect.height,
                    fkFieldPositions,
                    seqAnchorPositions,
                });
            });

            setCardPositions(positions);
        };

        // 초기 계산: DOM 렌더 후 100ms 대기
        const timer = setTimeout(updatePositions, 100);

        // ResizeObserver로 컨테이너 크기 변화(리사이즈·컬럼 리플로우 포함) 감지
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
            observer = new ResizeObserver(() => {
                updatePositions();
            });
            observer.observe(containerRef.current);
        } else {
            window.addEventListener("resize", updatePositions);
        }

        return () => {
            clearTimeout(timer);
            if (observer) {
                observer.disconnect();
            } else {
                window.removeEventListener("resize", updatePositions);
            }
        };
    }, [cardItems, masonryColumns]);

    // Masonry 컬럼 수 자동 계산 (컨테이너 너비 기준)
    useEffect(() => {
        const hostEl = masonryHostRef.current;
        if (!hostEl) return;

        const COLUMN_GAP = MASONRY_SPACING * 8;

        const updateColumns = () => {
            const width = hostEl.clientWidth;
            const nextColumns = Math.max(
                1,
                Math.floor(
                    (width + COLUMN_GAP) / (MASONRY_CARD_WIDTH + COLUMN_GAP),
                ),
            );
            setMasonryColumns((prev) =>
                prev === nextColumns ? prev : nextColumns,
            );
        };

        updateColumns();

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(updateColumns);
            observer.observe(hostEl);
            return () => observer.disconnect();
        }

        window.addEventListener("resize", updateColumns);
        return () => window.removeEventListener("resize", updateColumns);
    }, [cardItems.length]);

    // 장애물을 피하는 관계선 경로 계산
    // 구조: [카드경계출발] --스텁(겹침허용)--> [통로진입] --레인오프셋(겹침방지)--> [통로탈출] --스텁(겹침허용)--> [카드경계도착]
    const relationPaths = useMemo(() => {
        if (cardPositions.size === 0) return [];

        const obstacles = Array.from(cardPositions.values()).map((pos) => ({
            x: pos.x,
            y: pos.y,
            width: pos.width,
            height: pos.height,
        }));

        type RelationEntry = {
            routeId: string;
            startBoundary: { x: number; y: number }; // 카드 경계 출발
            endBoundary: { x: number; y: number }; // 카드 경계 도착
            corridorStart: { x: number; y: number }; // 통로 진입점 (OBSTACLE_PAD 경계)
            corridorEnd: { x: number; y: number }; // 통로 탈출점 (OBSTACLE_PAD 경계)
        };
        const relations: RelationEntry[] = [];

        cardItems.forEach((item) => {
            const sourcePos = cardPositions.get(item.name);
            if (!sourcePos) return;
            item.fkFields.forEach((fk) => {
                const startBoundary = sourcePos.fkFieldPositions.get(fk.field);
                const targetPos = cardPositions.get(fk.targetEntity);
                const endBoundary = targetPos?.seqAnchorPositions.get(
                    item.name,
                );
                if (!startBoundary || !endBoundary || !targetPos) return;

                // 통로 진입/탈출점: 카드 경계에서 OBSTACLE_PAD 만큼 바깥
                const corridorStart = {
                    x:
                        startBoundary.x > sourcePos.x + sourcePos.width / 2
                            ? startBoundary.x + OBSTACLE_PAD // 오른쪽 출발
                            : startBoundary.x - OBSTACLE_PAD, // 왼쪽 출발
                    y: startBoundary.y,
                };
                const corridorEnd = {
                    x:
                        endBoundary.x > targetPos.x + targetPos.width / 2
                            ? endBoundary.x + OBSTACLE_PAD // 오른쪽 도착
                            : endBoundary.x - OBSTACLE_PAD, // 왼쪽 도착
                    y: endBoundary.y,
                };

                relations.push({
                    routeId: `${item.name}/${fk.field}`,
                    startBoundary,
                    endBoundary,
                    corridorStart,
                    corridorEnd,
                });
            });
        });

        if (relations.length === 0) return [];

        // 그래프 터미널은 통로 진입/탈출점
        const terminals = relations.flatMap((r) => [
            r.corridorStart,
            r.corridorEnd,
        ]);
        const graph = buildRoutingGraph(obstacles, terminals);

        const pathResults = relations.map((rel) => {
            const { points, edgeKeys } = findShortestPath(
                graph,
                rel.corridorStart,
                rel.corridorEnd,
            );
            return {
                routeId: rel.routeId,
                startBoundary: rel.startBoundary,
                endBoundary: rel.endBoundary,
                corridorStart: rel.corridorStart,
                corridorEnd: rel.corridorEnd,
                points,
                edgeKeys,
            };
        });

        // 통로 구간 edgeUsage 집계 (레인 오프셋 계산용)
        const edgeUsage = new Map<string, string[]>();
        pathResults.forEach(({ routeId, edgeKeys }) => {
            edgeKeys.forEach((key) => {
                const users = edgeUsage.get(key) ?? [];
                if (!users.includes(routeId)) users.push(routeId);
                edgeUsage.set(key, users);
            });
        });

        return pathResults.map(
            ({
                routeId,
                startBoundary,
                endBoundary,
                corridorStart,
                corridorEnd,
                points,
                edgeKeys,
            }) => {
                // 통로 구간에 레인 오프셋 적용
                const segments = getPathSegments(points, edgeKeys);
                const offset = buildOffsetSegments(
                    segments,
                    routeId,
                    edgeUsage,
                    graph.edgeWidths,
                );
                const corridorPoints = applySegmentOffsets(offset);

                // 스텁 조립:
                //   startBoundary --[수평]--> stubEntry
                //   stubEntry --[수직(corridorStart.x 고정)]--> corridorPoints[0]
                //   ...corridorPoints (Dijkstra 보장 경로)...
                //   corridorPoints[last] --[수직(corridorEnd.x 고정)]--> stubExit
                //   stubExit --[수평]--> endBoundary
                //
                // 수직 스텁은 corridorStart.x/End.x 위에서만 이동 → 패딩 경계이므로 안전
                // corridorPoints 는 Dijkstra 경로 그대로 유지 (오버라이드 없음)
                const cp0 = corridorPoints[0] ?? corridorStart;
                const cpLast =
                    corridorPoints[corridorPoints.length - 1] ?? corridorEnd;

                const assembled: { x: number; y: number }[] = [
                    startBoundary,
                    // 수평 스텁: 카드 경계 → corridorStart.x (같은 Y)
                    { x: corridorStart.x, y: startBoundary.y },
                    // 수직 연결: corridorStart.x 고정, stubEntry.y → cp0.y
                    { x: corridorStart.x, y: cp0.y },
                    ...corridorPoints,
                    // 수직 연결: corridorEnd.x 고정, cpLast.y → stubExit.y
                    { x: corridorEnd.x, y: cpLast.y },
                    { x: corridorEnd.x, y: endBoundary.y },
                    endBoundary,
                ];

                // snapOrthogonal에 obstacles 전달 → 남은 대각선을 장애물 회피 방향으로 교정
                const fullPoints = snapOrthogonal(assembled, obstacles);
                return { routeId, svgPath: pathToSvgPath(fullPoints) };
            },
        );
    }, [cardPositions, cardItems]);

    return (
        <Box
            sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
            }}
        >
            <OverlayScrollbar track={{ alignment: "outside" }}>
                {schemaQuery.isLoading ? (
                    <Box
                        sx={{
                            height: "100%",
                            display: "grid",
                            placeItems: "center",
                        }}
                    >
                        <CircularProgress />
                    </Box>
                ) : schemaQuery.error ? (
                    <Alert severity="error">
                        엔티티 스키마를 불러오지 못했습니다. 잠시 후 다시 시도해
                        주세요.
                    </Alert>
                ) : (
                    <Box sx={{ p: 8, position: "relative" }} ref={containerRef}>
                        <Box ref={masonryHostRef}>
                            <Masonry
                                columns={masonryColumns}
                                spacing={MASONRY_SPACING}
                            >
                                {cardItems.map((item) => (
                                    <Box
                                        key={item.name}
                                        sx={{
                                            opacity: 0.5,
                                            pointerEvents: "none",
                                        }}
                                    >
                                        <ErdEntityCard
                                            ref={(el) => {
                                                if (el)
                                                    cardRefs.current.set(
                                                        item.name,
                                                        el,
                                                    );
                                                else
                                                    cardRefs.current.delete(
                                                        item.name,
                                                    );
                                            }}
                                            entityName={item.name}
                                            fkFields={item.fkFields}
                                            indexFields={item.indexFields}
                                        />
                                    </Box>
                                ))}
                            </Masonry>
                        </Box>
                        {cardPositions.size > 0 && (
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    pointerEvents: "none",
                                    zIndex: 2,
                                    bgcolor: "rgba(33, 150, 243, 0.12)",
                                }}
                            >
                                {/* 빨간 박스: 카드 장애물 영역 */}
                                {Array.from(cardPositions.values()).map(
                                    (pos) => (
                                        <Box
                                            key={`obstacle-${pos.name}`}
                                            sx={{
                                                position: "absolute",
                                                left: pos.x,
                                                top: pos.y,
                                                width: pos.width,
                                                height: pos.height,
                                                bgcolor:
                                                    "rgba(244, 67, 54, 0.28)",
                                                border: "1px solid rgba(244, 67, 54, 0.55)",
                                            }}
                                        />
                                    ),
                                )}
                                {/* 파란 점: FK 필드 박스 오른쪽 출발점 */}
                                {Array.from(cardPositions.values()).flatMap(
                                    (pos) =>
                                        Array.from(
                                            pos.fkFieldPositions.entries(),
                                        ).map(([fieldName, pt]) => (
                                            <Box
                                                key={`fk-dot-${pos.name}-${fieldName}`}
                                                sx={{
                                                    position: "absolute",
                                                    left: pt.x - 5,
                                                    top: pt.y - 5,
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: "50%",
                                                    bgcolor: "#2196f3",
                                                    zIndex: 3,
                                                    boxShadow: "0 0 0 2px #fff",
                                                }}
                                            />
                                        )),
                                )}
                                {/* 녹색 점: 소스별 도착 앵커 (가까운 쪽 경계) */}
                                {Array.from(cardPositions.values()).flatMap(
                                    (pos) =>
                                        Array.from(
                                            pos.seqAnchorPositions.entries(),
                                        ).map(([sourceEntity, pt]) => (
                                            <Box
                                                key={`seq-dot-${pos.name}-${sourceEntity}`}
                                                sx={{
                                                    position: "absolute",
                                                    left: pt.x - 5,
                                                    top: pt.y - 5,
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: "50%",
                                                    bgcolor: "#4caf50",
                                                    zIndex: 3,
                                                    boxShadow: "0 0 0 2px #fff",
                                                }}
                                            />
                                        )),
                                )}
                            </Box>
                        )}
                        {/* SVG 관계선 (임시 비활성화) */}
                        {false && relationPaths.length > 0 && (
                            <Box
                                component="svg"
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    pointerEvents: "none",
                                    zIndex: 4,
                                    overflow: "visible",
                                }}
                            >
                                {relationPaths.map(({ routeId, svgPath }) => (
                                    <path
                                        key={routeId}
                                        d={svgPath}
                                        fill="none"
                                        stroke="#ff9800"
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                )}
            </OverlayScrollbar>
        </Box>
    );
}
