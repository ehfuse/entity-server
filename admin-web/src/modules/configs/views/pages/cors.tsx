import { useState, useCallback, useEffect } from "react";
import { Box, Alert, Switch, TextField } from "@mui/material";
import type { ConfigDomain } from "../../models/types/config";
import { FieldGroup, FieldRow } from "../components/ConfigFormUI";

interface CORSConfig {
    cors_enabled?: boolean;
    cors_allow_origins?: string;
    cors_allow_methods?: string;
    cors_allow_headers?: string;
    cors_allow_credentials?: boolean;
    [key: string]: unknown;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const CORSPage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as CORSConfig;

    const [corsEnabled, setCorsEnabled] = useState(raw.cors_enabled ?? false);
    const [corsAllowOrigins, setCorsAllowOrigins] = useState(
        raw.cors_allow_origins ?? "*",
    );
    const [corsAllowMethods, setCorsAllowMethods] = useState(
        raw.cors_allow_methods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    const [corsAllowHeaders, setCorsAllowHeaders] = useState(
        raw.cors_allow_headers ??
            "Origin,Content-Type,Accept,Authorization,X-API-Key,X-Signature,X-Timestamp,X-Nonce,X-Transaction-ID",
    );
    const [corsAllowCredentials, setCorsAllowCredentials] = useState(
        raw.cors_allow_credentials ?? false,
    );

    const handleSave = useCallback(() => {
        onSave(item.domain, {
            cors_enabled: corsEnabled,
            cors_allow_origins: corsAllowOrigins,
            cors_allow_methods: corsAllowMethods,
            cors_allow_headers: corsAllowHeaders,
            cors_allow_credentials: corsAllowCredentials,
        });
    }, [
        item.domain,
        onSave,
        corsEnabled,
        corsAllowOrigins,
        corsAllowMethods,
        corsAllowHeaders,
        corsAllowCredentials,
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

            <FieldGroup
                title="CORS"
                subtitle="Cross-Origin Resource Sharing 설정"
            >
                <FieldRow label="cors_enabled" description="CORS 활성화 여부">
                    <Switch
                        size="medium"
                        checked={corsEnabled}
                        onChange={(e) => setCorsEnabled(e.target.checked)}
                    />
                </FieldRow>
                <FieldRow
                    label="cors_allow_origins"
                    description="허용할 오리진 (* = 전체)"
                >
                    <TextField
                        size="small"
                        value={corsAllowOrigins}
                        onChange={(e) => setCorsAllowOrigins(e.target.value)}
                        sx={{ width: 320 }}
                    />
                </FieldRow>
                <FieldRow
                    label="cors_allow_methods"
                    description="허용할 HTTP 메서드"
                >
                    <TextField
                        size="small"
                        value={corsAllowMethods}
                        onChange={(e) => setCorsAllowMethods(e.target.value)}
                        sx={{ width: 380 }}
                    />
                </FieldRow>
                <FieldRow
                    label="cors_allow_headers"
                    description="허용할 요청 헤더"
                >
                    <TextField
                        size="small"
                        value={corsAllowHeaders}
                        onChange={(e) => setCorsAllowHeaders(e.target.value)}
                        fullWidth
                    />
                </FieldRow>
                <FieldRow
                    label="cors_allow_credentials"
                    description="인증 정보 포함 허용"
                >
                    <Switch
                        size="medium"
                        checked={corsAllowCredentials}
                        onChange={(e) =>
                            setCorsAllowCredentials(e.target.checked)
                        }
                    />
                </FieldRow>
            </FieldGroup>
        </Box>
    );
};

export default CORSPage;
