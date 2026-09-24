export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type PathSegment = {
    start: Point;
    end: Point;
    isVertical: boolean;
    edgeKey: string;
};

type Edge = {
    to: number;
    cost: number;
    edgeKey: string;
};

type RoutingGraph = {
    points: Point[];
    adjacency: Map<number, Edge[]>;
    pointIndexByCoord: Map<string, number>;
    edgeWidths: Map<string, number>;
};

const EPS = 0.5;
const BOUNDARY_MARGIN = 32;

/**
 * 장애물 주변 배제 여백 (px).
 * ErdTest.tsx 에서 동일 값을 사용해 터미널을 패딩 경계 위에 배치합니다.
 */
export const OBSTACLE_PAD = 10;

const coordKey = (p: Point): string => `${Math.round(p.x)}:${Math.round(p.y)}`;

/** 패딩된 장애물 내부 → 그래프 노드 제외. 경계(=) 는 포함 */
const isInsideBlockedZone = (p: Point, rect: Rect): boolean =>
    p.x > rect.x - OBSTACLE_PAD &&
    p.x < rect.x + rect.width + OBSTACLE_PAD &&
    p.y > rect.y - OBSTACLE_PAD &&
    p.y < rect.y + rect.height + OBSTACLE_PAD;

/** 축 정렬 선분이 패딩된 장애물 영역을 통과하는지 검사 (경계는 통과 아님) */
const segmentCrossesBlockedZone = (a: Point, b: Point, rect: Rect): boolean => {
    const L = rect.x - OBSTACLE_PAD;
    const R = rect.x + rect.width + OBSTACLE_PAD;
    const T = rect.y - OBSTACLE_PAD;
    const B = rect.y + rect.height + OBSTACLE_PAD;

    if (Math.abs(a.x - b.x) < EPS) {
        const x = a.x;
        if (x <= L || x >= R) return false;
        const yMin = Math.min(a.y, b.y);
        const yMax = Math.max(a.y, b.y);
        return yMax > T && yMin < B;
    }
    if (Math.abs(a.y - b.y) < EPS) {
        const y = a.y;
        if (y <= T || y >= B) return false;
        const xMin = Math.min(a.x, b.x);
        const xMax = Math.max(a.x, b.x);
        return xMax > L && xMin < R;
    }
    return true;
};

const isSegmentFree = (a: Point, b: Point, obstacles: Rect[]): boolean =>
    !obstacles.some((rect) => segmentCrossesBlockedZone(a, b, rect));

const getEdgeKey = (a: Point, b: Point): string => {
    if (Math.abs(a.x - b.x) < EPS) {
        const y1 = Math.min(a.y, b.y);
        const y2 = Math.max(a.y, b.y);
        return `V:${Math.round(a.x)}:${Math.round(y1)}:${Math.round(y2)}`;
    }
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    return `H:${Math.round(a.y)}:${Math.round(x1)}:${Math.round(x2)}`;
};

const corridorWidthForHorizontal = (y: number, obstacles: Rect[]): number => {
    let above = Number.NEGATIVE_INFINITY;
    let below = Number.POSITIVE_INFINITY;
    obstacles.forEach((rect) => {
        const padB = rect.y + rect.height + OBSTACLE_PAD;
        const padT = rect.y - OBSTACLE_PAD;
        if (padB <= y) above = Math.max(above, padB);
        if (padT >= y) below = Math.min(below, padT);
    });
    if (!Number.isFinite(above) || !Number.isFinite(below)) return 48;
    return Math.max(12, below - above);
};

const corridorWidthForVertical = (x: number, obstacles: Rect[]): number => {
    let left = Number.NEGATIVE_INFINITY;
    let right = Number.POSITIVE_INFINITY;
    obstacles.forEach((rect) => {
        const padR = rect.x + rect.width + OBSTACLE_PAD;
        const padL = rect.x - OBSTACLE_PAD;
        if (padR <= x) left = Math.max(left, padR);
        if (padL >= x) right = Math.min(right, padL);
    });
    if (!Number.isFinite(left) || !Number.isFinite(right)) return 48;
    return Math.max(12, right - left);
};

export function buildRoutingGraph(
    obstacles: Rect[],
    terminals: Point[],
): RoutingGraph {
    const xs = new Set<number>();
    const ys = new Set<number>();

    const allPX = [
        ...obstacles.map((r) => r.x),
        ...obstacles.map((r) => r.x + r.width),
        ...terminals.map((p) => p.x),
    ];
    const allPY = [
        ...obstacles.map((r) => r.y),
        ...obstacles.map((r) => r.y + r.height),
        ...terminals.map((p) => p.y),
    ];

    xs.add(Math.min(...allPX) - BOUNDARY_MARGIN);
    xs.add(Math.max(...allPX) + BOUNDARY_MARGIN);
    ys.add(Math.min(...allPY) - BOUNDARY_MARGIN);
    ys.add(Math.max(...allPY) + BOUNDARY_MARGIN);

    // 터미널 좌표는 반드시 포함 (패딩 경계 위에 배치되므로 blocked zone 바깥)
    terminals.forEach((p) => {
        xs.add(p.x);
        ys.add(p.y);
    });

    // 장애물 패딩 경계선을 그리드에 추가 → 통로 분기점
    obstacles.forEach((rect) => {
        xs.add(rect.x - OBSTACLE_PAD);
        xs.add(rect.x + rect.width + OBSTACLE_PAD);
        ys.add(rect.y - OBSTACLE_PAD);
        ys.add(rect.y + rect.height + OBSTACLE_PAD);
    });

    const sortedX = Array.from(xs).sort((a, b) => a - b);
    const sortedY = Array.from(ys).sort((a, b) => a - b);

    const points: Point[] = [];
    const pointIndexByCoord = new Map<string, number>();

    sortedY.forEach((y) => {
        sortedX.forEach((x) => {
            const p = { x, y };
            if (obstacles.some((rect) => isInsideBlockedZone(p, rect))) return;
            const idx = points.length;
            points.push(p);
            pointIndexByCoord.set(coordKey(p), idx);
        });
    });

    const adjacency = new Map<number, Edge[]>();
    const edgeWidths = new Map<string, number>();

    const xIndexOf = new Map(sortedX.map((v, i) => [v, i] as [number, number]));
    const yIndexOf = new Map(sortedY.map((v, i) => [v, i] as [number, number]));

    const addEdge = (from: number, to: number, edgeKey: string) => {
        const fp = points[from];
        const tp = points[to];
        const cost = Math.abs(fp.x - tp.x) + Math.abs(fp.y - tp.y);
        const edges = adjacency.get(from) ?? [];
        edges.push({ to, cost, edgeKey });
        adjacency.set(from, edges);
    };

    points.forEach((p, idx) => {
        const xi = xIndexOf.get(p.x)!;
        const yi = yIndexOf.get(p.y)!;

        const candidates: Point[] = [];
        if (xi > 0) candidates.push({ x: sortedX[xi - 1], y: p.y });
        if (xi < sortedX.length - 1)
            candidates.push({ x: sortedX[xi + 1], y: p.y });
        if (yi > 0) candidates.push({ x: p.x, y: sortedY[yi - 1] });
        if (yi < sortedY.length - 1)
            candidates.push({ x: p.x, y: sortedY[yi + 1] });

        candidates.forEach((next) => {
            const nextIdx = pointIndexByCoord.get(coordKey(next));
            if (nextIdx === undefined) return;
            if (!isSegmentFree(p, next, obstacles)) return;

            const edgeKey = getEdgeKey(p, next);
            if (!edgeWidths.has(edgeKey)) {
                const width =
                    Math.abs(p.x - next.x) < EPS
                        ? corridorWidthForVertical(p.x, obstacles)
                        : corridorWidthForHorizontal(p.y, obstacles);
                edgeWidths.set(edgeKey, width);
            }
            addEdge(idx, nextIdx, edgeKey);
        });
    });

    return { points, adjacency, pointIndexByCoord, edgeWidths };
}

/** 최소 힙 기반 Dijkstra */
export function findShortestPath(
    graph: RoutingGraph,
    start: Point,
    end: Point,
): { points: Point[]; edgeKeys: string[] } {
    const startIdx = graph.pointIndexByCoord.get(coordKey(start));
    const endIdx = graph.pointIndexByCoord.get(coordKey(end));

    // 그래프에 없는 경우 가장 가까운 노드로 연결
    const nearestIdx = (pt: Point): number => {
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        graph.points.forEach((p, i) => {
            const d = Math.abs(p.x - pt.x) + Math.abs(p.y - pt.y);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        });
        return best;
    };

    const sIdx = startIdx ?? nearestIdx(start);
    const eIdx = endIdx ?? nearestIdx(end);

    if (sIdx === -1 || eIdx === -1) {
        return {
            points: [start, { x: end.x, y: start.y }, end],
            edgeKeys: [
                getEdgeKey(start, { x: end.x, y: start.y }),
                getEdgeKey({ x: end.x, y: start.y }, end),
            ],
        };
    }

    const n = graph.points.length;
    const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
    const prev = new Int32Array(n).fill(-1);
    const prevEdge = new Array<string>(n).fill("");
    dist[sIdx] = 0;

    // 간단한 배열 기반 min-heap [cost, nodeIdx]
    const heap: [number, number][] = [[0, sIdx]];
    const heapUp = (k: number) => {
        while (k > 0) {
            const p = (k - 1) >> 1;
            if (heap[p][0] <= heap[k][0]) break;
            [heap[p], heap[k]] = [heap[k], heap[p]];
            k = p;
        }
    };
    const heapDown = (k: number) => {
        while (true) {
            const l = k * 2 + 1,
                r = k * 2 + 2;
            let m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]];
            k = m;
        }
    };
    const heapPush = (c: number, i: number) => {
        heap.push([c, i]);
        heapUp(heap.length - 1);
    };
    const heapPop = (): [number, number] => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
            heap[0] = last;
            heapDown(0);
        }
        return top;
    };

    while (heap.length > 0) {
        const [d, u] = heapPop();
        if (d > dist[u]) continue;
        if (u === eIdx) break;
        for (const edge of graph.adjacency.get(u) ?? []) {
            const alt = dist[u] + edge.cost;
            if (alt < dist[edge.to]) {
                dist[edge.to] = alt;
                prev[edge.to] = u;
                prevEdge[edge.to] = edge.edgeKey;
                heapPush(alt, edge.to);
            }
        }
    }

    if (!Number.isFinite(dist[eIdx])) {
        return {
            points: [start, { x: end.x, y: start.y }, end],
            edgeKeys: [
                getEdgeKey(start, { x: end.x, y: start.y }),
                getEdgeKey({ x: end.x, y: start.y }, end),
            ],
        };
    }

    const nodePath: number[] = [];
    const edgeKeysRev: string[] = [];
    let cur = eIdx;
    while (cur !== -1) {
        nodePath.push(cur);
        const p = prev[cur];
        if (p !== -1) edgeKeysRev.push(prevEdge[cur]);
        cur = p;
    }
    nodePath.reverse();
    edgeKeysRev.reverse();

    let pts = nodePath.map((i) => graph.points[i]);
    if (startIdx === undefined) {
        pts = [start, ...pts];
        edgeKeysRev.unshift(getEdgeKey(start, pts[1]));
    }
    if (endIdx === undefined) {
        edgeKeysRev.push(getEdgeKey(pts[pts.length - 1], end));
        pts = [...pts, end];
    }

    return { points: pts, edgeKeys: edgeKeysRev };
}

export function getPathSegments(
    points: Point[],
    edgeKeys: string[],
): PathSegment[] {
    const segments: PathSegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        segments.push({
            start,
            end,
            isVertical: Math.abs(start.x - end.x) < EPS,
            edgeKey: edgeKeys[i] || getEdgeKey(start, end),
        });
    }
    return segments;
}

export function computeLaneOffset(
    edgeWidth: number,
    totalLines: number,
    lineIndex: number,
): number {
    if (totalLines <= 1) return 0;
    const ratio = (lineIndex + 1) / (totalLines + 1);
    return (ratio - 0.5) * edgeWidth;
}

export function buildOffsetSegments(
    segments: PathSegment[],
    routeId: string,
    edgeUsage: Map<string, string[]>,
    edgeWidths: Map<string, number>,
): PathSegment[] {
    return segments.map((seg) => {
        const users = edgeUsage.get(seg.edgeKey) || [];
        const routeIndex = Math.max(0, users.indexOf(routeId));
        const width = edgeWidths.get(seg.edgeKey) || 24;
        const offset = computeLaneOffset(width, users.length, routeIndex);
        if (seg.isVertical) {
            return {
                ...seg,
                start: { x: seg.start.x + offset, y: seg.start.y },
                end: { x: seg.end.x + offset, y: seg.end.y },
            };
        }
        return {
            ...seg,
            start: { x: seg.start.x, y: seg.start.y + offset },
            end: { x: seg.end.x, y: seg.end.y + offset },
        };
    });
}

export function applySegmentOffsets(segments: PathSegment[]): Point[] {
    if (segments.length === 0) return [];
    const result: Point[] = [segments[0].start];
    for (let i = 0; i < segments.length - 1; i++) {
        const cur = segments[i];
        const nxt = segments[i + 1];
        if (!cur.isVertical && nxt.isVertical) {
            result.push({ x: nxt.start.x, y: cur.end.y });
        } else if (cur.isVertical && !nxt.isVertical) {
            result.push({ x: cur.end.x, y: nxt.start.y });
        } else {
            result.push(cur.end);
        }
    }
    result.push(segments[segments.length - 1].end);
    const dedup: Point[] = [];
    result.forEach((p) => {
        const last = dedup[dedup.length - 1];
        if (
            !last ||
            Math.abs(last.x - p.x) > EPS ||
            Math.abs(last.y - p.y) > EPS
        )
            dedup.push(p);
    });
    return dedup;
}

/**
 * 대각선 구간을 꺾인선으로 교정
 * obstacles 제공 시, 수평 먼저 교정이 장애물을 통과하면 수직 먼저로 전환
 */
export function snapOrthogonal(points: Point[], obstacles?: Rect[]): Point[] {
    if (points.length < 2) return points;
    const result: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const dx = Math.abs(curr.x - prev.x);
        const dy = Math.abs(curr.y - prev.y);
        if (dx > EPS && dy > EPS) {
            // 수평 먼저 (기본): { x: curr.x, y: prev.y }
            const hBend: Point = { x: curr.x, y: prev.y };
            // 수직 먼저 (대안): { x: prev.x, y: curr.y }
            const vBend: Point = { x: prev.x, y: curr.y };

            const hBlockedByObstacle =
                obstacles &&
                (obstacles.some((r) =>
                    segmentCrossesBlockedZone(prev, hBend, r),
                ) ||
                    obstacles.some((r) =>
                        segmentCrossesBlockedZone(hBend, curr, r),
                    ));

            if (hBlockedByObstacle) {
                result.push(vBend);
            } else {
                result.push(hBend);
            }
        }
        result.push(curr);
    }
    const dedup: Point[] = [];
    result.forEach((p) => {
        const last = dedup[dedup.length - 1];
        if (
            !last ||
            Math.abs(last.x - p.x) > EPS ||
            Math.abs(last.y - p.y) > EPS
        )
            dedup.push(p);
    });
    return dedup;
}

export function pathToSvgPath(points: Point[]): string {
    if (points.length === 0) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
}
