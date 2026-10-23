import { useState, useCallback, useEffect } from "react";
import {
    Box,
    Divider,
    Typography,
    Alert,
    Switch,
    TextField,
    Paper,
} from "@mui/material";

import type { ConfigDomain } from "../../models/types/config";
import { FieldRow } from "../components/ConfigFormUI";

interface CacheDefaults {
    enabled: boolean;
    driver: string;
    ttl_seconds: number;
}

interface FileDriver {
    dir: string;
}

interface MemcachedDriver {
    servers: string[];
}

interface RedisDriver {
    addr: string;
    password: string;
    db: number;
    prefix: string;
}

interface CacheDrivers {
    file?: FileDriver;
    memcached?: MemcachedDriver;
    redis?: RedisDriver;
}

interface CacheConfig {
    defaults?: CacheDefaults;
    drivers?: CacheDrivers;
    [key: string]: unknown;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const CachePage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as CacheConfig;

    const [defaults, setDefaults] = useState<CacheDefaults>(
        raw.defaults ?? { enabled: true, driver: "memory", ttl_seconds: 60 },
    );
    const [fileDriver, setFileDriver] = useState<FileDriver>(
        raw.drivers?.file ?? { dir: ".cache/entity" },
    );
    const [memcachedDriver, setMemcachedDriver] = useState<MemcachedDriver>(
        raw.drivers?.memcached ?? { servers: ["127.0.0.1:11211"] },
    );
    const [redisDriver, setRedisDriver] = useState<RedisDriver>(
        raw.drivers?.redis ?? {
            addr: "127.0.0.1:6379",
            password: "",
            db: 0,
            prefix: "entity_cache:",
        },
    );

    const handleSave = useCallback(() => {
        const config: CacheConfig = {
            ...item.config,
            defaults,
            drivers: {
                file: fileDriver,
                memcached: memcachedDriver,
                redis: redisDriver,
            },
        };
        // description 키 제거
        delete config.description;
        onSave(item.domain, config as Record<string, unknown>);
    }, [defaults, fileDriver, memcachedDriver, redisDriver, item, onSave]);

    useEffect(() => {
        registerSave(handleSave);
    }, [registerSave, handleSave]);

    return (
        <Box sx={{ p: 3 }}>
            {!item.exists && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    설정 파일이 존재하지 않습니다. 저장하면 파일이 생성됩니다.
                </Alert>
            )}

            {/* 기본 설정 */}
            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: "#475569", mb: 1 }}
            >
                기본 설정
            </Typography>
            <Paper variant="outlined" sx={{ px: 2, pb: 1, mb: 3 }}>
                <FieldRow label="enabled" description="캐시 활성화 여부">
                    <Switch
                        checked={defaults.enabled}
                        onChange={(e) =>
                            setDefaults((p) => ({
                                ...p,
                                enabled: e.target.checked,
                            }))
                        }
                    />
                </FieldRow>
                <Divider />
                <FieldRow
                    label="driver"
                    description="기본 캐시 드라이버 (memory | file | memcached | redis)"
                >
                    <TextField
                        size="small"
                        fullWidth
                        value={defaults.driver}
                        onChange={(e) =>
                            setDefaults((p) => ({
                                ...p,
                                driver: e.target.value,
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
                <Divider />
                <FieldRow
                    label="ttl_seconds"
                    description="기본 캐시 유효 시간 (초)"
                >
                    <TextField
                        size="small"
                        type="number"
                        fullWidth
                        value={defaults.ttl_seconds}
                        onChange={(e) =>
                            setDefaults((p) => ({
                                ...p,
                                ttl_seconds: Number(e.target.value),
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
            </Paper>

            {/* File 드라이버 */}
            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: "#475569", mb: 1 }}
            >
                File 드라이버
            </Typography>
            <Paper variant="outlined" sx={{ px: 2, pb: 1, mb: 3 }}>
                <FieldRow label="dir" description="캐시 파일 저장 디렉토리">
                    <TextField
                        size="small"
                        fullWidth
                        value={fileDriver.dir}
                        onChange={(e) => setFileDriver({ dir: e.target.value })}
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
            </Paper>

            {/* Memcached 드라이버 */}
            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: "#475569", mb: 1 }}
            >
                Memcached 드라이버
            </Typography>
            <Paper variant="outlined" sx={{ px: 2, pb: 1, mb: 3 }}>
                <FieldRow
                    label="servers"
                    description="Memcached 서버 목록 (쉼표로 구분)"
                >
                    <TextField
                        size="small"
                        fullWidth
                        value={memcachedDriver.servers.join(", ")}
                        onChange={(e) =>
                            setMemcachedDriver({
                                servers: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                            })
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
            </Paper>

            {/* Redis 드라이버 */}
            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: "#475569", mb: 1 }}
            >
                Redis 드라이버
            </Typography>
            <Paper variant="outlined" sx={{ px: 2, pb: 1, mb: 3 }}>
                <FieldRow label="addr" description="Redis 주소 (host:port)">
                    <TextField
                        size="small"
                        fullWidth
                        value={redisDriver.addr}
                        onChange={(e) =>
                            setRedisDriver((p) => ({
                                ...p,
                                addr: e.target.value,
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
                <Divider />
                <FieldRow
                    label="password"
                    description="Redis 비밀번호 (없으면 빈 값)"
                >
                    <TextField
                        size="small"
                        fullWidth
                        type="password"
                        value={redisDriver.password}
                        onChange={(e) =>
                            setRedisDriver((p) => ({
                                ...p,
                                password: e.target.value,
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
                <Divider />
                <FieldRow label="db" description="Redis 데이터베이스 번호">
                    <TextField
                        size="small"
                        type="number"
                        fullWidth
                        value={redisDriver.db}
                        onChange={(e) =>
                            setRedisDriver((p) => ({
                                ...p,
                                db: Number(e.target.value),
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
                <Divider />
                <FieldRow label="prefix" description="Redis 키 접두사">
                    <TextField
                        size="small"
                        fullWidth
                        value={redisDriver.prefix}
                        onChange={(e) =>
                            setRedisDriver((p) => ({
                                ...p,
                                prefix: e.target.value,
                            }))
                        }
                        sx={{
                            "& .MuiInputBase-input": {
                                fontFamily: "D2Coding",
                            },
                        }}
                    />
                </FieldRow>
            </Paper>
        </Box>
    );
};

export default CachePage;
