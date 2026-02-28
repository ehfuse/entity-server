import {
    entityServer,
    type EntityListParams,
    type EntityListResult,
    type EntityHistoryRecord,
    type EntityQueryRequest,
    type RegisterPushDeviceOptions,
    type EntityServerClient,
} from "entity-server-client";

export const ACCESS_TOKEN_KEY = "auth_access_token";
export const REFRESH_TOKEN_KEY = "auth_refresh_token";

// admin-web 은 Vite 프로젝트이므로 VITE_ prefix 환경변수를 사용합니다.
const _envBaseUrl = String(
    import.meta.env.VITE_ENTITY_SERVER_URL || "",
).replace(/\/$/, "");

// 앱 시작 시 localStorage 토큰도 함께 초기화 (새로고침 대응)
const _initToken =
    localStorage.getItem(ACCESS_TOKEN_KEY) ||
    localStorage.getItem("auth_token") ||
    "";
entityServer.configure({
    ...(_envBaseUrl ? { baseUrl: _envBaseUrl } : {}),
    ...(_initToken ? { token: _initToken } : {}),
});

/**
 * login/logout 시 entityServer 토큰을 동기화합니다.
 */
export function syncToken(): void {
    const token =
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
        localStorage.getItem("auth_token") ||
        "";
    entityServer.setToken(token);
}

/**
 * 헬스체크를 수행하고 서버의 패킷 암호화 설정을 감지한 후
 * 클라이언트에 자동으로 반영합니다.
 */
export async function checkServerHealth(): Promise<{
    ok: boolean;
    packet_encryption?: boolean;
}> {
    try {
        return await entityServer.checkHealth();
    } catch (err) {
        console.warn("[health check failed]", err);
        return { ok: false };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin API 클라이언트
// admin 라우트(/v1/admin/...)는 패킷 암호화가 없는 plain JSON 응답을 사용하므로
// native fetch 기반의 경량 클라이언트로 처리합니다.
// ─────────────────────────────────────────────────────────────────────────────

async function _adminFetch<T>(
    method: string,
    path: string,
    opts: {
        params?: Record<string, unknown>;
        body?: unknown;
        headers?: Record<string, string>;
    } = {},
): Promise<T> {
    const token =
        localStorage.getItem(ACCESS_TOKEN_KEY) ||
        localStorage.getItem("auth_token") ||
        "";
    const isAuthPath =
        path.includes("/v1/auth/login") || path.includes("/v1/auth/refresh");

    // URL 빌드 (쿼리 파라미터 포함)
    const base = _envBaseUrl || "";
    const url = new URL(base + path, window.location.origin);
    if (opts.params) {
        for (const [k, v] of Object.entries(opts.params)) {
            if (v != null) url.searchParams.set(k, String(v));
        }
    }

    const buildHeaders = (t: string): Record<string, string> => ({
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
    });

    const doFetch = (t: string) =>
        fetch(url.toString(), {
            method,
            headers: buildHeaders(t),
            // string body는 이미 직렬화된 JSON이므로 그대로 전송합니다.
            ...(opts.body != null
                ? {
                      body:
                          typeof opts.body === "string"
                              ? opts.body
                              : JSON.stringify(opts.body),
                  }
                : {}),
        });

    let res = await doFetch(token);

    // 401 → refresh token → retry
    if (res.status === 401 && !isAuthPath) {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
            try {
                const refreshed = await entityServer.refreshToken(refreshToken);
                const newToken = refreshed.access_token;
                localStorage.setItem(ACCESS_TOKEN_KEY, newToken);
                entityServer.setToken(newToken);
                res = await doFetch(newToken);
            } catch {
                // refresh 실패 → 아래 공통 로그아웃 처리
            }
        }
        if (res.status === 401) {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem("auth_token");
            if (!isAuthPath) {
                window.location.href = "/login";
            }
        }
    }

    const data = await res.json();
    return data as T;
}

/**
 * Admin 라우트 전용 HTTP 클라이언트.
 * 각 메서드는 서버 응답 JSON을 그대로 반환합니다.
 *
 * @example
 * const res = await admin.get<ApiResponse<X>>("/v1/admin/entities");
 * return res.data ?? [];
 */
export const admin = {
    get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
        return _adminFetch<T>("GET", path, { params });
    },
    post<T>(
        path: string,
        body?: unknown,
        opts?: {
            headers?: Record<string, string>;
            params?: Record<string, unknown>;
        },
    ): Promise<T> {
        return _adminFetch<T>("POST", path, { body, ...opts });
    },
    put<T>(path: string, body?: unknown): Promise<T> {
        return _adminFetch<T>("PUT", path, { body });
    },
    patch<T>(path: string, body?: unknown): Promise<T> {
        return _adminFetch<T>("PATCH", path, { body });
    },
    delete<T>(path: string): Promise<T> {
        return _adminFetch<T>("DELETE", path);
    },
};

export {
    entityServer,
    type EntityListParams,
    type EntityListResult,
    type EntityHistoryRecord,
    type EntityQueryRequest,
    type RegisterPushDeviceOptions,
    type EntityServerClient,
};
