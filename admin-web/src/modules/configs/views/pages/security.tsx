import { useState, useCallback, useRef, useEffect } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import type { ConfigDomain } from "../../models/types/config";
import { FieldRow, SectionTitle } from "../components/ConfigFormUI";

// ───────────────────── 사용 가능한 전체 권한 목록 ─────────────────────
const ALL_PERMISSIONS = [
    "entity:meta",
    "entity:validate",
    "entity:read",
    "entity:list",
    "entity:count",
    "entity:query",
    "entity:create",
    "entity:update",
    "entity:delete",
    "entity:history",
    "entity:rollback",
    "admin:entities",
    "admin:stats",
    "admin:reindex",
    "admin:config",
    "admin:logs",
    "*",
];

interface NonceStore {
    driver: string;
    memcache_servers: string[];
    redis_addr: string;
    redis_password: string;
    redis_db: number;
    redis_prefix: string;
}

interface RoleConfig {
    permissions: string[];
}

interface ApiKeyConfig {
    role: string;
    entities: string[];
    description: string;
}

interface SecurityConfig {
    enable_hmac?: boolean;
    enable_rbac?: boolean;
    timestamp_skew_sec?: number;
    nonce_ttl_sec?: number;
    auth_fail_limit_per_min?: number;
    auth_block_sec?: number;
    nonce_store?: NonceStore;
    roles?: Record<string, RoleConfig>;
    api_keys?: Record<string, ApiKeyConfig>;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

// ───────────────────── NonceStore 편집기 ─────────────────────
const NONCE_DRIVERS = ["memory", "redis", "memcached"];

const NonceStoreEditor = ({
    value,
    onChange,
}: {
    value: NonceStore;
    onChange: (v: NonceStore) => void;
}) => {
    const set = <K extends keyof NonceStore>(k: K, v: NonceStore[K]) =>
        onChange({ ...value, [k]: v });

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <FieldRow label="driver" description="Nonce 저장소 드라이버">
                <FormControl size="small" sx={{ width: 160 }}>
                    <Select
                        value={value.driver}
                        onChange={(e) => set("driver", e.target.value)}
                    >
                        {NONCE_DRIVERS.map((d) => (
                            <MenuItem key={d} value={d}>
                                {d}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </FieldRow>

            {value.driver === "memcached" && (
                <FieldRow
                    label="memcache_servers"
                    description="Memcached 서버 주소 목록"
                >
                    <TextField
                        size="small"
                        value={value.memcache_servers.join(",")}
                        onChange={(e) =>
                            set(
                                "memcache_servers",
                                e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                            )
                        }
                        placeholder="localhost:11211,host2:11211"
                        sx={{ width: 360 }}
                        helperText="쉼표(,)로 구분"
                    />
                </FieldRow>
            )}

            {value.driver === "redis" && (
                <>
                    <FieldRow label="redis_addr" description="Redis 서버 주소">
                        <TextField
                            size="small"
                            value={value.redis_addr}
                            onChange={(e) => set("redis_addr", e.target.value)}
                            placeholder="localhost:6379"
                            sx={{ width: 260 }}
                        />
                    </FieldRow>
                    <FieldRow
                        label="redis_password"
                        description="Redis 비밀번호 (없으면 빈 값)"
                    >
                        <TextField
                            size="small"
                            type="password"
                            value={value.redis_password}
                            onChange={(e) =>
                                set("redis_password", e.target.value)
                            }
                            sx={{ width: 260 }}
                        />
                    </FieldRow>
                    <FieldRow label="redis_db" description="Redis DB 번호">
                        <TextField
                            size="small"
                            type="number"
                            value={value.redis_db}
                            onChange={(e) =>
                                set("redis_db", Number(e.target.value))
                            }
                            sx={{ width: 100 }}
                        />
                    </FieldRow>
                    <FieldRow
                        label="redis_prefix"
                        description="Nonce 키 접두사"
                    >
                        <TextField
                            size="small"
                            value={value.redis_prefix}
                            onChange={(e) =>
                                set("redis_prefix", e.target.value)
                            }
                            sx={{ width: 180 }}
                        />
                    </FieldRow>
                </>
            )}
        </Box>
    );
};

// ───────────────────── 역할 권한 편집기 ─────────────────────
const RoleEditor = ({
    roleName,
    role,
    onChange,
    onDelete,
}: {
    roleName: string;
    role: RoleConfig;
    onChange: (v: RoleConfig) => void;
    onDelete: () => void;
}) => {
    const isWildcard = role.permissions.includes("*");

    const togglePerm = (perm: string) => {
        if (perm === "*") {
            onChange({ permissions: isWildcard ? [] : ["*"] });
            return;
        }
        if (isWildcard) return;
        const has = role.permissions.includes(perm);
        onChange({
            permissions: has
                ? role.permissions.filter((p) => p !== perm)
                : [...role.permissions, perm],
        });
    };

    return (
        <Box>
            <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
            >
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 700,
                        fontFamily: "D2Coding",
                        color: "#1e293b",
                    }}
                >
                    {roleName}
                </Typography>
                {isWildcard && (
                    <Chip label="전체 권한 (*)" size="small" color="error" />
                )}
                <Box sx={{ flexGrow: 1 }} />
                <IconButton size="small" color="error" onClick={onDelete}>
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {ALL_PERMISSIONS.map((perm) => {
                    const selected = isWildcard
                        ? perm === "*"
                        : role.permissions.includes(perm);
                    const disabled = isWildcard && perm !== "*";
                    return (
                        <Chip
                            key={perm}
                            label={perm}
                            size="small"
                            onClick={
                                disabled ? undefined : () => togglePerm(perm)
                            }
                            variant={selected ? "filled" : "outlined"}
                            color={
                                selected
                                    ? perm === "*"
                                        ? "error"
                                        : "primary"
                                    : "default"
                            }
                            sx={{
                                fontFamily: "D2Coding",
                                fontSize: "0.72rem",
                                cursor: disabled ? "default" : "pointer",
                                opacity: disabled ? 0.35 : 1,
                            }}
                        />
                    );
                })}
            </Box>
        </Box>
    );
};

// ───────────────────── API Key 편집기 ─────────────────────
const ApiKeyEditor = ({
    apiKey,
    keyConfig,
    onChange,
    onDelete,
    allRoles,
}: {
    apiKey: string;
    keyConfig: ApiKeyConfig;
    onChange: (key: string, v: ApiKeyConfig) => void;
    onDelete: (key: string) => void;
    allRoles: string[];
}) => {
    const set = <K extends keyof ApiKeyConfig>(k: K, v: ApiKeyConfig[K]) =>
        onChange(apiKey, { ...keyConfig, [k]: v });

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}
            >
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 700,
                        fontFamily: "D2Coding",
                        color: "#334155",
                    }}
                >
                    {apiKey}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <IconButton
                    size="small"
                    color="error"
                    onClick={() => onDelete(apiKey)}
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Box>
            <FieldRow label="role" description="이 키의 역할">
                <FormControl size="small" sx={{ width: 160 }}>
                    <Select
                        value={keyConfig.role}
                        onChange={(e) => set("role", e.target.value)}
                    >
                        {allRoles.map((r) => (
                            <MenuItem key={r} value={r}>
                                {r}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </FieldRow>
            <FieldRow
                label="entities"
                description="접근 허용 엔티티 (* = 전체)"
            >
                <TextField
                    size="small"
                    value={keyConfig.entities.join(",")}
                    onChange={(e) =>
                        set(
                            "entities",
                            e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                        )
                    }
                    placeholder="* 또는 user,post,..."
                    sx={{ width: 320 }}
                    helperText="쉼표(,)로 구분"
                />
            </FieldRow>
            <FieldRow label="description" description="키 설명">
                <TextField
                    size="small"
                    value={keyConfig.description}
                    onChange={(e) => set("description", e.target.value)}
                    sx={{ width: 360 }}
                />
            </FieldRow>
        </Box>
    );
};

// ───────────────────── SecurityPage ─────────────────────
const SecurityPage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as SecurityConfig;

    const [enableHmac, setEnableHmac] = useState(raw.enable_hmac ?? true);
    const [enableRbac, setEnableRbac] = useState(raw.enable_rbac ?? true);
    const [timestampSkewSec, setTimestampSkewSec] = useState(
        raw.timestamp_skew_sec ?? 300,
    );
    const [nonceTtlSec, setNonceTtlSec] = useState(raw.nonce_ttl_sec ?? 300);
    const [authFailLimitPerMin, setAuthFailLimitPerMin] = useState(
        raw.auth_fail_limit_per_min ?? 120,
    );
    const [authBlockSec, setAuthBlockSec] = useState(raw.auth_block_sec ?? 60);

    const [nonceStore, setNonceStore] = useState<NonceStore>(
        raw.nonce_store ?? {
            driver: "memory",
            memcache_servers: [],
            redis_addr: "localhost:6379",
            redis_password: "",
            redis_db: 0,
            redis_prefix: "nonce:",
        },
    );

    const [roles, setRoles] = useState<Record<string, RoleConfig>>(
        raw.roles ?? {},
    );
    const [apiKeys, setApiKeys] = useState<Record<string, ApiKeyConfig>>(
        raw.api_keys ?? {},
    );

    // 새 역할 추가
    const newRoleRef = useRef<HTMLInputElement>(null);
    const handleAddRole = () => {
        const name = newRoleRef.current?.value.trim();
        if (!name || roles[name]) return;
        setRoles((prev) => ({ ...prev, [name]: { permissions: [] } }));
        if (newRoleRef.current) newRoleRef.current.value = "";
    };

    // 새 API 키 추가
    const newApiKeyRef = useRef<HTMLInputElement>(null);
    const handleAddApiKey = () => {
        const key = newApiKeyRef.current?.value.trim();
        if (!key || apiKeys[key]) return;
        const firstRole = Object.keys(roles)[0] ?? "viewer";
        setApiKeys((prev) => ({
            ...prev,
            [key]: { role: firstRole, entities: ["*"], description: "" },
        }));
        if (newApiKeyRef.current) newApiKeyRef.current.value = "";
    };

    const handleSave = useCallback(() => {
        onSave(item.domain, {
            enable_hmac: enableHmac,
            enable_rbac: enableRbac,
            timestamp_skew_sec: timestampSkewSec,
            nonce_ttl_sec: nonceTtlSec,
            auth_fail_limit_per_min: authFailLimitPerMin,
            auth_block_sec: authBlockSec,
            nonce_store: nonceStore,
            roles,
            api_keys: apiKeys,
        });
    }, [
        item.domain,
        onSave,
        enableHmac,
        enableRbac,
        timestampSkewSec,
        nonceTtlSec,
        authFailLimitPerMin,
        authBlockSec,
        nonceStore,
        roles,
        apiKeys,
    ]);

    useEffect(() => {
        registerSave(handleSave);
    }, [registerSave, handleSave]);

    const allRoleNames = Object.keys(roles);

    return (
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {!item.exists && (
                <Alert severity="warning">
                    설정 파일이 존재하지 않습니다. 저장하면 파일이 생성됩니다.
                </Alert>
            )}

            {/* 기본 보안 */}
            <Box>
                <SectionTitle title="기본 보안" />
                <Paper
                    variant="outlined"
                    sx={{ px: 2, pb: 1, borderRadius: 2 }}
                >
                    <FieldRow
                        label="enable_hmac"
                        description="HMAC 서명 검증 활성화 (서버-서버 전용, JWT Bearer 제외)"
                    >
                        <Switch
                            checked={enableHmac}
                            onChange={(e) => setEnableHmac(e.target.checked)}
                        />
                    </FieldRow>
                    <FieldRow
                        label="enable_rbac"
                        description="역할 기반 접근 제어(RBAC) 활성화"
                    >
                        <Switch
                            checked={enableRbac}
                            onChange={(e) => setEnableRbac(e.target.checked)}
                        />
                    </FieldRow>
                    <FieldRow
                        label="timestamp_skew_sec"
                        description="허용할 타임스탬프 오차 범위 (초)"
                    >
                        <TextField
                            size="small"
                            type="number"
                            value={timestampSkewSec}
                            onChange={(e) =>
                                setTimestampSkewSec(Number(e.target.value))
                            }
                            sx={{ width: 120 }}
                        />
                    </FieldRow>
                    <FieldRow
                        label="nonce_ttl_sec"
                        description="Nonce 유효 시간 (초), 재사용 방지"
                    >
                        <TextField
                            size="small"
                            type="number"
                            value={nonceTtlSec}
                            onChange={(e) =>
                                setNonceTtlSec(Number(e.target.value))
                            }
                            sx={{ width: 120 }}
                        />
                    </FieldRow>
                    <FieldRow
                        label="auth_fail_limit_per_min"
                        description="분당 인증 실패 허용 횟수"
                    >
                        <TextField
                            size="small"
                            type="number"
                            value={authFailLimitPerMin}
                            onChange={(e) =>
                                setAuthFailLimitPerMin(Number(e.target.value))
                            }
                            sx={{ width: 120 }}
                        />
                    </FieldRow>
                    <FieldRow
                        label="auth_block_sec"
                        description="인증 실패 초과 시 차단 시간 (초)"
                    >
                        <TextField
                            size="small"
                            type="number"
                            value={authBlockSec}
                            onChange={(e) =>
                                setAuthBlockSec(Number(e.target.value))
                            }
                            sx={{ width: 120 }}
                        />
                    </FieldRow>
                </Paper>
            </Box>

            {/* Nonce Store */}
            <Box>
                <SectionTitle
                    title="Nonce Store"
                    subtitle="Nonce 재사용 방지를 위한 저장소 설정"
                />
                <Paper
                    variant="outlined"
                    sx={{ px: 2, pb: 1.5, borderRadius: 2 }}
                >
                    <NonceStoreEditor
                        value={nonceStore}
                        onChange={setNonceStore}
                    />
                </Paper>
            </Box>

            {/* 역할(Roles) */}
            <Box>
                <SectionTitle
                    title="역할 (Roles)"
                    subtitle="역할별 API 권한 설정"
                />
                <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                    {allRoleNames.map((roleName) => (
                        <Paper
                            key={roleName}
                            variant="outlined"
                            sx={{ px: 2, pt: 1.5, pb: 1, borderRadius: 2 }}
                        >
                            <RoleEditor
                                roleName={roleName}
                                role={roles[roleName]}
                                onChange={(v) =>
                                    setRoles((prev) => ({
                                        ...prev,
                                        [roleName]: v,
                                    }))
                                }
                                onDelete={() =>
                                    setRoles((prev) => {
                                        const next = { ...prev };
                                        delete next[roleName];
                                        return next;
                                    })
                                }
                            />
                        </Paper>
                    ))}
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <TextField
                            inputRef={newRoleRef}
                            size="small"
                            placeholder="새 역할 이름"
                            sx={{ width: 200 }}
                            onKeyDown={(e) =>
                                e.key === "Enter" && handleAddRole()
                            }
                        />
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={handleAddRole}
                        >
                            역할 추가
                        </Button>
                    </Box>
                </Box>
            </Box>

            {/* API Keys */}
            <Box>
                <SectionTitle
                    title="API Keys"
                    subtitle="API 키 목록 및 역할/엔티티 매핑"
                />
                <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                    {Object.entries(apiKeys).map(([key, cfg]) => (
                        <Paper
                            key={key}
                            variant="outlined"
                            sx={{ px: 2, pt: 1.5, pb: 1, borderRadius: 2 }}
                        >
                            <ApiKeyEditor
                                apiKey={key}
                                keyConfig={cfg}
                                onChange={(_k, v) =>
                                    setApiKeys((prev) => ({
                                        ...prev,
                                        [key]: v,
                                    }))
                                }
                                onDelete={(k) =>
                                    setApiKeys((prev) => {
                                        const next = { ...prev };
                                        delete next[k];
                                        return next;
                                    })
                                }
                                allRoles={allRoleNames}
                            />
                        </Paper>
                    ))}
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <TextField
                            inputRef={newApiKeyRef}
                            size="small"
                            placeholder="새 API 키"
                            sx={{ width: 280 }}
                            onKeyDown={(e) =>
                                e.key === "Enter" && handleAddApiKey()
                            }
                        />
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={handleAddApiKey}
                        >
                            키 추가
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Divider />
        </Box>
    );
};

export default SecurityPage;
