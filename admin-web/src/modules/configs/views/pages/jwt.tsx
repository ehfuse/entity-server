import { useState, useCallback, useEffect } from "react";
import { Box, Divider, Typography, Alert } from "@mui/material";

import type { ConfigDomain } from "../../models/types/config";
import ConfigField from "../components/ConfigField";

const descriptions: Record<string, string> = {
    secret: "JWT 서명 비밀키 (환경변수 ${JWT_SECRET} 참조 가능)",
    access_ttl_sec: "액세스 토큰 유효 시간 (초, 기본 3600 = 1시간)",
    refresh_ttl_sec: "리프레시 토큰 유효 시간 (초, 기본 1209600 = 14일)",
    issuer: "JWT 발급자 식별자",
    algorithm: "서명 알고리즘 (HS256, HS384, HS512)",
};

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const JwtPage = ({ item, onSave, registerSave }: Props) => {
    const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(
        item.config,
    );

    const handleChange = useCallback((key: string, val: unknown) => {
        setLocalConfig((prev) => ({ ...prev, [key]: val }));
    }, []);

    const handleSave = useCallback(() => {
        onSave(item.domain, localConfig);
    }, [onSave, item.domain, localConfig]);

    useEffect(() => {
        registerSave(handleSave);
    }, [registerSave, handleSave]);

    const entries = Object.entries(localConfig);

    return (
        <Box sx={{ p: 3 }}>
            {!item.exists && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    설정 파일이 존재하지 않습니다. 저장하면 파일이 생성됩니다.
                </Alert>
            )}
            {entries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    설정이 비어있습니다
                </Typography>
            ) : (
                entries.map(([key, val], idx) => (
                    <Box key={key}>
                        {idx > 0 && <Divider />}
                        <ConfigField
                            fieldKey={key}
                            value={val}
                            onChange={handleChange}
                            description={descriptions[key]}
                        />
                    </Box>
                ))
            )}
        </Box>
    );
};

export default JwtPage;
