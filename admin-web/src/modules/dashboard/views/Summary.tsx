import {
    Alert,
    AlertTitle,
    Box,
    Chip,
    Divider,
    Typography,
} from "@mui/material";
import {
    Storage as StorageIcon,
    Description as DescriptionIcon,
    Person as PersonIcon,
    DataObject as DataObjectIcon,
    Shield as ShieldIcon,
    Dns as DnsIcon,
    Token as TokenIcon,
    Language as CorsIcon,
    VpnKey as VpnKeyIcon,
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entitiesApi } from "../../entities/models/api";
import { configsApi } from "../../configs/models/api";
import { licensesApi } from "../../licenses/models/api";
import { rolesApi } from "../../roles/models/api";
import { apiKeysApi } from "../../apikeys/models/api";
import {
    StatCard,
    InfoCard,
    InfoRow,
    InfoText,
} from "../components/DashboardCards";

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const DashboardSummary = () => {
    const navigate = useNavigate();

    const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
        queryKey: ["dashboardStats"],
        queryFn: async () => {
            const entitiesPage = await entitiesApi.getEntities();
            const summary = entitiesPage.summary as
                | {
                      entity_count?: unknown;
                      total_records?: unknown;
                      deleted_records?: unknown;
                      total_size_bytes?: unknown;
                  }
                | undefined;

            const items = entitiesPage.items ?? [];
            const totalsFromItems = items.reduce(
                (acc, entity) => {
                    const tableSummary = entity.table_summary;
                    acc.totalRecords += toNumberSafe(
                        tableSummary?.total_records,
                    );
                    acc.deletedRecords += toNumberSafe(
                        tableSummary?.deleted_records,
                    );
                    acc.totalSizeBytes += toNumberSafe(
                        tableSummary?.total_size_bytes,
                    );
                    return acc;
                },
                { totalRecords: 0, deletedRecords: 0, totalSizeBytes: 0 },
            );

            const userEntity = items.find((e) => e.name === "user");
            const accountEntity = items.find((e) => e.name === "account");
            const users = toNumberSafe(
                userEntity?.table_summary?.total_records ??
                    accountEntity?.table_summary?.total_records,
            );

            return {
                totalEntities: toNumberSafe(
                    summary?.entity_count,
                    toNumberSafe(entitiesPage.total, items.length),
                ),
                totalRecords: toNumberSafe(
                    summary?.total_records,
                    totalsFromItems.totalRecords,
                ),
                deletedRecords: toNumberSafe(
                    summary?.deleted_records,
                    totalsFromItems.deletedRecords,
                ),
                totalSizeBytes: toNumberSafe(
                    summary?.total_size_bytes,
                    totalsFromItems.totalSizeBytes,
                ),
                users,
            };
        },
    });

    const { data: licensesData, isLoading: licensesLoading } = useQuery({
        queryKey: ["dashboardLicenses"],
        queryFn: async () => {
            const result = await licensesApi.getLicenses({
                page: 1,
                page_size: 1,
            });
            return { total: result.total ?? 0 };
        },
    });

    const { data: configData, isLoading: configLoading } = useQuery({
        queryKey: ["dashboardConfigs"],
        queryFn: async () => {
            const [configs, rolesResult, apiKeysResult] = await Promise.all([
                configsApi.getConfigs(),
                rolesApi.getRoles({ page: 1, page_size: 1 }),
                apiKeysApi.getApiKeys({ page: 1, page_size: 1 }),
            ]);

            const sec = configs.items.find((c) => c.domain === "security")
                ?.config as Record<string, unknown> | undefined;
            const cors = configs.items.find((c) => c.domain === "cors")
                ?.config as Record<string, unknown> | undefined;
            const db = configs.items.find((c) => c.domain === "database")
                ?.config as Record<string, unknown> | undefined;
            const srv = configs.items.find((c) => c.domain === "server")
                ?.config as Record<string, unknown> | undefined;
            const jwt = configs.items.find((c) => c.domain === "jwt")
                ?.config as Record<string, unknown> | undefined;

            const configuredRoles = sec?.roles
                ? Object.keys(sec.roles as object).length
                : 0;
            const configuredApiKeys = sec?.api_keys
                ? Object.keys(sec.api_keys as object).length
                : 0;

            return {
                // 서버
                namespace: String(srv?.namespace ?? ""),
                defaultEmailDomain: String(srv?.default_email_domain ?? ""),
                port: Number(srv?.port ?? 0),
                environment: String(srv?.environment ?? ""),
                corsEnabled: Boolean(cors?.cors_enabled),
                corsAllowOrigins: String(cors?.cors_allow_origins ?? "*"),
                corsMethods: String(cors?.cors_allow_methods ?? ""),
                corsCredentials: Boolean(cors?.cors_allow_credentials),
                // 보안
                enableHmac: Boolean(sec?.enable_hmac),
                enableRbac: Boolean(sec?.enable_rbac),
                nonceTtlSec: Number(sec?.nonce_ttl_sec ?? 0),
                nonceDriver: String(
                    (sec?.nonce_store as Record<string, unknown>)?.driver ??
                        "memory",
                ),
                authFailLimit: Number(sec?.auth_fail_limit_per_min ?? 0),
                authBlockSec: Number(sec?.auth_block_sec ?? 0),
                roles: Number(rolesResult.total ?? configuredRoles),
                apiKeys: Number(apiKeysResult.total ?? configuredApiKeys),
                // DB
                dbGroups: db?.groups
                    ? Object.keys(db.groups as object).length
                    : 0,
                dbDefault: String(
                    (db as Record<string, unknown>)?.default ?? "",
                ),
                // JWT
                jwtIssuer: String(jwt?.issuer ?? ""),
                jwtAlgorithm: String(jwt?.algorithm ?? ""),
                jwtAccessTtl: Number(jwt?.access_ttl_sec ?? 0),
                jwtRefreshTtl: Number(jwt?.refresh_ttl_sec ?? 0),
            };
        },
    });

    // 서버 미실행 감지: /v1/health 에 3초 타임아웃으로 빠르게 핑
    const { isError: serverDown, isLoading: serverChecking } = useQuery({
        queryKey: ["serverHealth"],
        queryFn: async () => {
            const { entityServer } = await import("entity-server-client");
            const health = await entityServer.checkHealth();
            if (!health.ok) throw new Error("Server health check failed");
            return health;
        },
        retry: 0,
        refetchOnWindowFocus: false,
        staleTime: 10_000,
    });

    const isServerUnreachable = !serverChecking && serverDown;

    const fmtTtl = (sec: number) => {
        if (sec >= 86400) return `${(sec / 86400).toFixed(0)}일`;
        if (sec >= 3600) return `${(sec / 3600).toFixed(0)}시간`;
        return `${sec}초`;
    };

    return (
        <Box>
            {serverChecking && (
                <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
                    서버 연결 상태를 확인하는 중…
                </Alert>
            )}
            {isServerUnreachable && (
                <Alert severity="error" variant="outlined" sx={{ mb: 3 }}>
                    <AlertTitle sx={{ fontWeight: 700 }}>
                        서버에 연결할 수 없습니다
                    </AlertTitle>
                    <Box component="span" display="block" sx={{ mb: 0.5 }}>
                        Entity Server가 실행 중이지 않거나 포트{" "}
                        <strong>47200</strong>이 닫혀 있습니다.
                    </Box>
                    <Box
                        component="code"
                        sx={{
                            display: "block",
                            mt: 1,
                            p: 1,
                            bgcolor: "action.hover",
                            borderRadius: 1,
                            fontFamily: "D2Coding",
                            fontSize: "0.82rem",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            userSelect: "all",
                        }}
                    >
                        {"./scripts/run.sh start"}
                    </Box>
                    <Box
                        component="span"
                        display="block"
                        sx={{
                            mt: 0.5,
                            color: "text.secondary",
                            fontSize: "0.78rem",
                        }}
                    >
                        서버를 시작한 후 페이지를 새로고침하세요.
                    </Box>
                </Alert>
            )}

            {/* ── 데이터 현황 ── */}
            <Typography
                variant="subtitle2"
                sx={{ mt: 2, mb: 1, color: "text.secondary", fontWeight: 600 }}
            >
                데이터 현황
            </Typography>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        md: "repeat(3, 1fr)",
                        lg: "repeat(5, 1fr)",
                    },
                    gap: 2,
                }}
            >
                <StatCard
                    title="총 엔티티 수"
                    value={entitiesData?.totalEntities ?? 0}
                    icon={<StorageIcon fontSize="inherit" />}
                    loading={entitiesLoading}
                    onClick={() => navigate("/entities")}
                />
                <StatCard
                    title="총 레코드 수"
                    value={(entitiesData?.totalRecords ?? 0).toLocaleString()}
                    sub={`삭제됨 ${(entitiesData?.deletedRecords ?? 0).toLocaleString()}건`}
                    icon={<DescriptionIcon fontSize="inherit" />}
                    loading={entitiesLoading}
                />
                <StatCard
                    title="전체 사용량"
                    value={formatBytes(entitiesData?.totalSizeBytes ?? 0)}
                    icon={<DataObjectIcon fontSize="inherit" />}
                    loading={entitiesLoading}
                />
                <StatCard
                    title="사용자 수"
                    value={(entitiesData?.users ?? 0).toLocaleString()}
                    icon={<PersonIcon fontSize="inherit" />}
                    loading={entitiesLoading}
                    onClick={() => navigate("/users")}
                />
                <StatCard
                    title="라이선스 수"
                    value={(licensesData?.total ?? 0).toLocaleString()}
                    icon={<VpnKeyIcon fontSize="inherit" />}
                    loading={licensesLoading}
                    onClick={() => navigate("/licenses")}
                />
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* ── 서버 구성 요약 ── */}
            <Typography
                variant="subtitle2"
                sx={{ mb: 1.5, color: "text.secondary", fontWeight: 600 }}
            >
                서버 구성
            </Typography>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        lg: "repeat(4, 1fr)",
                    },
                    gap: 2,
                }}
            >
                {/* 서버 기본 정보 */}
                <InfoCard
                    title="서버 기본 정보"
                    icon={<DnsIcon fontSize="inherit" />}
                    loading={configLoading}
                    onClick={() => navigate("/configs?tab=server")}
                >
                    <InfoRow label="namespace" first>
                        <InfoText value={configData?.namespace ?? ""} mono />
                    </InfoRow>
                    <InfoRow label="email domain">
                        <InfoText
                            value={configData?.defaultEmailDomain ?? ""}
                            mono
                        />
                    </InfoRow>
                    <InfoRow label="port">
                        <InfoText value={configData?.port ?? ""} mono />
                    </InfoRow>
                    <InfoRow label="environment">
                        <Chip
                            label={configData?.environment ?? ""}
                            size="small"
                            color={
                                configData?.environment === "production"
                                    ? "error"
                                    : "warning"
                            }
                            variant="outlined"
                        />
                    </InfoRow>
                    <InfoRow label="DB 그룹">
                        <InfoText value={`${configData?.dbGroups ?? 0}개`} />
                        {configData?.dbDefault && (
                            <Chip
                                label={configData.dbDefault}
                                size="small"
                                variant="outlined"
                                sx={{ ml: 0.5 }}
                            />
                        )}
                    </InfoRow>
                </InfoCard>

                {/* 보안 */}
                <InfoCard
                    title="보안 (Security)"
                    icon={<ShieldIcon fontSize="inherit" />}
                    loading={configLoading}
                    onClick={() => navigate("/configs?tab=security")}
                >
                    <InfoRow label="HMAC" first>
                        <Chip
                            label={configData?.enableHmac ? "활성" : "비활성"}
                            size="small"
                            color={
                                configData?.enableHmac ? "success" : "default"
                            }
                            variant="outlined"
                        />
                    </InfoRow>
                    <InfoRow label="RBAC">
                        <Chip
                            label={configData?.enableRbac ? "활성" : "비활성"}
                            size="small"
                            color={
                                configData?.enableRbac ? "success" : "default"
                            }
                            variant="outlined"
                        />
                    </InfoRow>
                    <InfoRow label="Nonce 저장소">
                        <InfoText value={configData?.nonceDriver ?? ""} mono />
                    </InfoRow>
                    <InfoRow label="Nonce TTL">
                        <InfoText
                            value={fmtTtl(configData?.nonceTtlSec ?? 0)}
                        />
                    </InfoRow>
                    <InfoRow label="실패 제한">
                        <InfoText
                            value={`${configData?.authFailLimit ?? 0}회/분`}
                        />
                    </InfoRow>
                    <InfoRow label="차단 시간">
                        <InfoText
                            value={fmtTtl(configData?.authBlockSec ?? 0)}
                        />
                    </InfoRow>
                    <InfoRow label="역할 수 / API 키">
                        <InfoText
                            value={`${configData?.roles ?? 0}개 / ${configData?.apiKeys ?? 0}개`}
                        />
                    </InfoRow>
                </InfoCard>

                {/* JWT */}
                <InfoCard
                    title="JWT"
                    icon={<TokenIcon fontSize="inherit" />}
                    loading={configLoading}
                    onClick={() => navigate("/configs?tab=jwt")}
                >
                    <InfoRow label="issuer" first>
                        <InfoText value={configData?.jwtIssuer ?? ""} mono />
                    </InfoRow>
                    <InfoRow label="algorithm">
                        <Chip
                            label={configData?.jwtAlgorithm ?? ""}
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    </InfoRow>
                    <InfoRow label="Access TTL">
                        <InfoText
                            value={fmtTtl(configData?.jwtAccessTtl ?? 0)}
                        />
                    </InfoRow>
                    <InfoRow label="Refresh TTL">
                        <InfoText
                            value={fmtTtl(configData?.jwtRefreshTtl ?? 0)}
                        />
                    </InfoRow>
                </InfoCard>

                {/* CORS */}
                <InfoCard
                    title="CORS"
                    icon={<CorsIcon fontSize="inherit" />}
                    loading={configLoading}
                    onClick={() => navigate("/configs?tab=server")}
                >
                    <InfoRow label="상태" first>
                        <Chip
                            label={configData?.corsEnabled ? "활성" : "비활성"}
                            size="small"
                            color={
                                configData?.corsEnabled ? "success" : "default"
                            }
                            variant="outlined"
                        />
                    </InfoRow>
                    <InfoRow label="Origins">
                        <Typography
                            variant="body2"
                            sx={{
                                fontFamily: "D2Coding",
                                fontWeight: 600,
                                wordBreak: "break-all",
                            }}
                        >
                            {configData?.corsAllowOrigins ?? ""}
                        </Typography>
                    </InfoRow>
                    <InfoRow label="Methods">
                        <Typography
                            variant="caption"
                            sx={{
                                fontFamily: "D2Coding",
                                color: "text.secondary",
                            }}
                        >
                            {configData?.corsMethods ?? ""}
                        </Typography>
                    </InfoRow>
                    <InfoRow label="Credentials">
                        <Chip
                            label={
                                configData?.corsCredentials ? "허용" : "비허용"
                            }
                            size="small"
                            color={
                                configData?.corsCredentials
                                    ? "warning"
                                    : "default"
                            }
                            variant="outlined"
                        />
                    </InfoRow>
                </InfoCard>
            </Box>
        </Box>
    );
};

export default DashboardSummary;
