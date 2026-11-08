import { useState, useCallback, useEffect } from "react";
import {
    Box,
    Alert,
    Switch,
    TextField,
    MenuItem,
    Select,
    FormControl,
} from "@mui/material";
import type { ConfigDomain } from "../../models/types/config";
import { FieldGroup, FieldRow } from "../components/ConfigFormUI";

const ENVIRONMENTS = ["development", "staging", "production"];
const LANGUAGES = ["ko", "en", "ja", "zh", "es", "de", "vi", "th", "id"];

interface ServerConfig {
    namespace?: string;
    default_email_domain?: string;
    language?: string;
    environment?: string;
    port?: number;
    prefork?: boolean;
    prefork_processes?: number;
    enable_auto_schema_sync?: boolean;
    global_license_scope?: boolean;
    global_optimistic_lock?: boolean;
    [key: string]: unknown;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const ServerPage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as ServerConfig;

    const [namespace, setNamespace] = useState(raw.namespace ?? "");
    const [defaultEmailDomain, setDefaultEmailDomain] = useState(
        raw.default_email_domain ?? "",
    );
    const [language, setLanguage] = useState(raw.language ?? "ko");
    const [environment, setEnvironment] = useState(
        raw.environment ?? "development",
    );
    const [port, setPort] = useState(raw.port ?? 47200);
    const [prefork, setPrefork] = useState(raw.prefork ?? false);
    const [preforkProcesses, setPreforkProcesses] = useState(
        raw.prefork_processes ?? 0,
    );
    const [enableAutoSchemaSync, setEnableAutoSchemaSync] = useState(
        raw.enable_auto_schema_sync ?? true,
    );
    const [globalLicenseScope, setGlobalLicenseScope] = useState(
        raw.global_license_scope ?? false,
    );
    const [globalOptimisticLock, setGlobalOptimisticLock] = useState(
        raw.global_optimistic_lock ?? false,
    );

    const handleSave = useCallback(() => {
        onSave(item.domain, {
            namespace,
            default_email_domain: defaultEmailDomain,
            language,
            environment,
            port,
            prefork,
            prefork_processes: preforkProcesses,
            enable_auto_schema_sync: enableAutoSchemaSync,
            global_license_scope: globalLicenseScope,
            global_optimistic_lock: globalOptimisticLock,
        });
    }, [
        item.domain,
        onSave,
        namespace,
        defaultEmailDomain,
        language,
        environment,
        port,
        prefork,
        preforkProcesses,
        enableAutoSchemaSync,
        globalLicenseScope,
        globalOptimisticLock,
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

            {/* 기본 정보 */}
            <FieldGroup title="기본 정보">
                <FieldRow
                    label="namespace"
                    description="서비스 네임스페이스 식별자"
                >
                    <TextField
                        size="small"
                        value={namespace}
                        onChange={(e) => setNamespace(e.target.value)}
                        sx={{ width: 260 }}
                    />
                </FieldRow>
                <FieldRow
                    label="default_email_domain"
                    description="기본 이메일 도메인"
                >
                    <TextField
                        size="small"
                        value={defaultEmailDomain}
                        onChange={(e) => setDefaultEmailDomain(e.target.value)}
                        sx={{ width: 260 }}
                    />
                </FieldRow>
                <FieldRow label="port" description="서버 포트 번호">
                    <TextField
                        size="small"
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow label="language" description="기본 언어 코드">
                    <FormControl size="small" sx={{ width: 120 }}>
                        <Select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                        >
                            {LANGUAGES.map((l) => (
                                <MenuItem key={l} value={l}>
                                    {l}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </FieldRow>
                <FieldRow
                    label="environment"
                    description="실행 환경 (development, production)"
                >
                    <FormControl size="small" sx={{ width: 160 }}>
                        <Select
                            value={environment}
                            onChange={(e) => setEnvironment(e.target.value)}
                        >
                            {ENVIRONMENTS.map((e) => (
                                <MenuItem key={e} value={e}>
                                    {e}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </FieldRow>
            </FieldGroup>

            {/* 서버 옵션 */}
            <FieldGroup title="서버 옵션">
                <FieldRow
                    label="prefork"
                    description="프리포크 모드 활성화 여부"
                >
                    <Switch
                        size="medium"
                        checked={prefork}
                        onChange={(e) => setPrefork(e.target.checked)}
                    />
                </FieldRow>
                <FieldRow
                    label="prefork_processes"
                    description="프리포크 프로세스 수 (0=자동)"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={preforkProcesses}
                        onChange={(e) =>
                            setPreforkProcesses(Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="enable_auto_schema_sync"
                    description="엔티티 스키마 자동 동기화"
                >
                    <Switch
                        size="medium"
                        checked={enableAutoSchemaSync}
                        onChange={(e) =>
                            setEnableAutoSchemaSync(e.target.checked)
                        }
                    />
                </FieldRow>
                <FieldRow
                    label="global_license_scope"
                    description="전역 라이선스 범위 사용"
                >
                    <Switch
                        size="medium"
                        checked={globalLicenseScope}
                        onChange={(e) =>
                            setGlobalLicenseScope(e.target.checked)
                        }
                    />
                </FieldRow>
                <FieldRow
                    label="global_optimistic_lock"
                    description="전역 낙관적 잠금 사용"
                >
                    <Switch
                        size="medium"
                        checked={globalOptimisticLock}
                        onChange={(e) =>
                            setGlobalOptimisticLock(e.target.checked)
                        }
                    />
                </FieldRow>
            </FieldGroup>
        </Box>
    );
};

export default ServerPage;
