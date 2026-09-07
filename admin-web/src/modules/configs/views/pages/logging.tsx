import { useState, useCallback, useEffect } from "react";
import {
    Box,
    Alert,
    Switch,
    TextField,
    Paper,
    MenuItem,
    Select,
    FormControl,
} from "@mui/material";

import type { ConfigDomain } from "../../models/types/config";
import { FieldRow, SectionTitle } from "../components/ConfigFormUI";

interface LogFileConfig {
    enabled: boolean;
    filename: string;
    max_size_mb: number;
    max_backups: number;
    max_age_days: number;
    compress: boolean;
    threshold_ms?: number;
}

interface LoggingConfig {
    level?: string;
    directory?: string;
    access?: LogFileConfig;
    error?: LogFileConfig;
    cli?: LogFileConfig;
    slow?: LogFileConfig;
    routes?: LogFileConfig;
    environments?: Record<string, unknown>;
    [key: string]: unknown;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];

const LogFileSection = ({
    title,
    subtitle,
    data,
    onChange,
    showThreshold,
}: {
    title: string;
    subtitle?: string;
    data: LogFileConfig;
    onChange: (val: LogFileConfig) => void;
    showThreshold?: boolean;
}) => {
    const set = <K extends keyof LogFileConfig>(
        key: K,
        val: LogFileConfig[K],
    ) => onChange({ ...data, [key]: val });

    return (
        <Box>
            <SectionTitle title={title} subtitle={subtitle} />
            <Paper variant="outlined" sx={{ px: 2, pb: 1, borderRadius: 2 }}>
                <FieldRow
                    label="enabled"
                    description="이 로그 타입 활성화 여부"
                >
                    <Switch
                        size="medium"
                        checked={data.enabled}
                        onChange={(e) => set("enabled", e.target.checked)}
                    />
                </FieldRow>
                <FieldRow label="filename" description="저장할 로그 파일명">
                    <TextField
                        size="small"
                        value={data.filename}
                        onChange={(e) => set("filename", e.target.value)}
                        sx={{ width: 220 }}
                    />
                </FieldRow>
                <FieldRow
                    label="max_size_mb"
                    description="파일 최대 크기 (MB). 초과 시 rotate"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.max_size_mb}
                        onChange={(e) =>
                            set("max_size_mb", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="max_backups"
                    description="보관할 백업 파일 최대 개수"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.max_backups}
                        onChange={(e) =>
                            set("max_backups", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="max_age_days"
                    description="로그 파일 보관 최대 일수"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.max_age_days}
                        onChange={(e) =>
                            set("max_age_days", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="compress"
                    description="오래된 로그 파일을 gzip 압축"
                >
                    <Switch
                        size="medium"
                        checked={data.compress}
                        onChange={(e) => set("compress", e.target.checked)}
                    />
                </FieldRow>
                {showThreshold && (
                    <FieldRow
                        label="threshold_ms"
                        description="이 시간(ms) 이상 소요된 쿼리를 슬로우 로그에 기록"
                    >
                        <TextField
                            size="small"
                            type="number"
                            value={data.threshold_ms ?? 1000}
                            onChange={(e) =>
                                set("threshold_ms", Number(e.target.value))
                            }
                            sx={{ width: 120 }}
                        />
                    </FieldRow>
                )}
            </Paper>
        </Box>
    );
};

const LoggingPage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as LoggingConfig;

    const [level, setLevel] = useState(raw.level ?? "INFO");
    const [directory, setDirectory] = useState(raw.directory ?? "logs");
    const [access, setAccess] = useState<LogFileConfig>(
        raw.access ?? {
            enabled: true,
            filename: "access.log",
            max_size_mb: 100,
            max_backups: 7,
            max_age_days: 14,
            compress: true,
        },
    );
    const [error, setError] = useState<LogFileConfig>(
        raw.error ?? {
            enabled: true,
            filename: "error.log",
            max_size_mb: 100,
            max_backups: 7,
            max_age_days: 30,
            compress: true,
        },
    );
    const [cli, setCli] = useState<LogFileConfig>(
        raw.cli ?? {
            enabled: true,
            filename: "cli.log",
            max_size_mb: 100,
            max_backups: 7,
            max_age_days: 14,
            compress: true,
        },
    );
    const [slow, setSlow] = useState<LogFileConfig>(
        raw.slow ?? {
            enabled: true,
            filename: "slow.log",
            max_size_mb: 100,
            max_backups: 7,
            max_age_days: 14,
            compress: true,
            threshold_ms: 1000,
        },
    );
    const [routes, setRoutes] = useState<LogFileConfig>(
        raw.routes ?? {
            enabled: true,
            filename: "routes.log",
            max_size_mb: 50,
            max_backups: 7,
            max_age_days: 14,
            compress: true,
        },
    );
    const [environments, setEnvironments] = useState(raw.environments ?? {});

    const handleSave = useCallback(() => {
        onSave(item.domain, {
            level,
            directory,
            access,
            error,
            cli,
            slow,
            routes,
            environments,
        });
    }, [
        item.domain,
        onSave,
        level,
        directory,
        access,
        error,
        cli,
        slow,
        routes,
        environments,
    ]);

    useEffect(() => {
        registerSave(handleSave);
    }, [registerSave, handleSave]);

    return (
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {!item.exists && (
                <Alert severity="warning">
                    설정 파일이 존재하지 않습니다. 저장하면 파일이 생성됩니다.
                </Alert>
            )}

            {/* 기본 설정 */}
            <Box>
                <SectionTitle title="기본 설정" />
                <Paper
                    variant="outlined"
                    sx={{ px: 2, pb: 1, borderRadius: 2 }}
                >
                    <FieldRow
                        label="level"
                        description="기본 로그 레벨. 환경별 오버라이드 가능"
                    >
                        <FormControl size="small" sx={{ width: 140 }}>
                            <Select
                                value={level}
                                onChange={(e) => setLevel(e.target.value)}
                            >
                                {LOG_LEVELS.map((l) => (
                                    <MenuItem key={l} value={l}>
                                        {l}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </FieldRow>
                    <FieldRow
                        label="directory"
                        description="로그 파일이 저장될 디렉토리 경로"
                    >
                        <TextField
                            size="small"
                            value={directory}
                            onChange={(e) => setDirectory(e.target.value)}
                            sx={{ width: 260 }}
                        />
                    </FieldRow>
                </Paper>
            </Box>

            <LogFileSection
                title="Access Log"
                subtitle="HTTP 접근 로그"
                data={access}
                onChange={setAccess}
            />
            <LogFileSection
                title="Error Log"
                subtitle="에러 로그"
                data={error}
                onChange={setError}
            />
            <LogFileSection
                title="CLI Log"
                subtitle="CLI 명령 실행 로그"
                data={cli}
                onChange={setCli}
            />
            <LogFileSection
                title="Slow Log"
                subtitle="슬로우 쿼리 로그"
                data={slow}
                onChange={setSlow}
                showThreshold
            />
            <LogFileSection
                title="Routes Log"
                subtitle="라우트 실패 로그 (404/405/401/403/5xx)"
                data={routes}
                onChange={setRoutes}
            />

            {/* environments */}
            <Box>
                <SectionTitle
                    title="environments"
                    subtitle="환경별 설정 오버라이드 (JSON)"
                />
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <TextField
                        fullWidth
                        multiline
                        minRows={4}
                        maxRows={10}
                        size="small"
                        value={JSON.stringify(environments, null, 2)}
                        onChange={(e) => {
                            try {
                                setEnvironments(JSON.parse(e.target.value));
                            } catch {
                                /* ignore */
                            }
                        }}
                        inputProps={{
                            style: {
                                fontFamily: "D2Coding",
                                fontSize: "0.82rem",
                            },
                        }}
                    />
                </Paper>
            </Box>
        </Box>
    );
};

export default LoggingPage;
