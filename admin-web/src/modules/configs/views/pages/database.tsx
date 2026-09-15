import { useState, useCallback, useEffect } from "react";
import {
    Box,
    Button,
    Typography,
    Alert,
    TextField,
    Paper,
    MenuItem,
    Select,
    FormControl,
    IconButton,
    Chip,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import type { ConfigDomain } from "../../models/types/config";
import { FieldRow } from "../components/ConfigFormUI";

const DB_DRIVERS = ["mysql", "postgres", "sqlite3"];

interface DbGroup {
    driver: string;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    password_env: string;
    maxOpenConns: number;
    maxIdleConns: number;
    connMaxLifetimeSec: number;
}

interface DatabaseConfig {
    default?: string;
    groups?: Record<string, DbGroup>;
    [key: string]: unknown;
}

interface Props {
    item: ConfigDomain;
    onSave: (domain: string, config: Record<string, unknown>) => void;
    registerSave: (fn: () => void) => void;
}

const DEFAULT_GROUP: DbGroup = {
    driver: "mysql",
    host: "localhost",
    port: 3306,
    database: "",
    user: "",
    password: "",
    password_env: "",
    maxOpenConns: 20,
    maxIdleConns: 10,
    connMaxLifetimeSec: 3600,
};

const GroupEditor = ({
    name,
    data,
    isDefault,
    onChange,
    onDelete,
    onSetDefault,
}: {
    name: string;
    data: DbGroup;
    isDefault: boolean;
    onChange: (val: DbGroup) => void;
    onDelete: () => void;
    onSetDefault: () => void;
}) => {
    const set = <K extends keyof DbGroup>(key: K, val: DbGroup[K]) =>
        onChange({ ...data, [key]: val });

    return (
        <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography
                    variant="subtitle2"
                    sx={{
                        fontWeight: 700,
                        color: "#1e293b",
                        fontFamily: "D2Coding",
                    }}
                >
                    {name}
                </Typography>
                {isDefault && (
                    <Chip
                        label="default"
                        size="small"
                        color="primary"
                        sx={{ height: 18, fontSize: "0.65rem" }}
                    />
                )}
                {!isDefault && (
                    <Button
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.65rem", py: 0 }}
                        onClick={onSetDefault}
                    >
                        default로 지정
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" color="error" onClick={onDelete}>
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Box>
            <Paper variant="outlined" sx={{ px: 2, pb: 1, borderRadius: 2 }}>
                <FieldRow label="driver" description="데이터베이스 드라이버">
                    <FormControl size="small" sx={{ width: 140 }}>
                        <Select
                            value={data.driver}
                            onChange={(e) => set("driver", e.target.value)}
                        >
                            {DB_DRIVERS.map((d) => (
                                <MenuItem key={d} value={d}>
                                    {d}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </FieldRow>
                <FieldRow label="host" description="DB 서버 호스트">
                    <TextField
                        size="small"
                        value={data.host}
                        onChange={(e) => set("host", e.target.value)}
                        sx={{ width: 260 }}
                    />
                </FieldRow>
                <FieldRow label="port" description="DB 서버 포트">
                    <TextField
                        size="small"
                        type="number"
                        value={data.port}
                        onChange={(e) => set("port", Number(e.target.value))}
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow label="database" description="사용할 데이터베이스명">
                    <TextField
                        size="small"
                        value={data.database}
                        onChange={(e) => set("database", e.target.value)}
                        sx={{ width: 260 }}
                    />
                </FieldRow>
                <FieldRow label="user" description="DB 접속 사용자명">
                    <TextField
                        size="small"
                        value={data.user}
                        onChange={(e) => set("user", e.target.value)}
                        sx={{ width: 200 }}
                    />
                </FieldRow>
                <FieldRow
                    label="password"
                    description="DB 접속 비밀번호 (직접 입력)"
                >
                    <TextField
                        size="small"
                        type="password"
                        value={data.password}
                        onChange={(e) => set("password", e.target.value)}
                        sx={{ width: 200 }}
                    />
                </FieldRow>
                <FieldRow
                    label="password_env"
                    description="비밀번호를 읽어올 환경변수명"
                >
                    <TextField
                        size="small"
                        value={data.password_env}
                        onChange={(e) => set("password_env", e.target.value)}
                        sx={{ width: 260 }}
                    />
                </FieldRow>
                <FieldRow
                    label="maxOpenConns"
                    description="최대 오픈 커넥션 수"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.maxOpenConns}
                        onChange={(e) =>
                            set("maxOpenConns", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="maxIdleConns"
                    description="최대 유휴 커넥션 수"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.maxIdleConns}
                        onChange={(e) =>
                            set("maxIdleConns", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
                <FieldRow
                    label="connMaxLifetimeSec"
                    description="커넥션 최대 수명 (초)"
                >
                    <TextField
                        size="small"
                        type="number"
                        value={data.connMaxLifetimeSec}
                        onChange={(e) =>
                            set("connMaxLifetimeSec", Number(e.target.value))
                        }
                        sx={{ width: 120 }}
                    />
                </FieldRow>
            </Paper>
        </Box>
    );
};

const DatabasePage = ({ item, onSave, registerSave }: Props) => {
    const raw = item.config as DatabaseConfig;
    const [defaultGroup, setDefaultGroup] = useState(raw.default ?? "");
    const [groups, setGroups] = useState<Record<string, DbGroup>>(
        (raw.groups as Record<string, DbGroup>) ?? {},
    );
    const [newGroupName, setNewGroupName] = useState("");

    const handleGroupChange = useCallback((name: string, val: DbGroup) => {
        setGroups((prev) => ({ ...prev, [name]: val }));
    }, []);

    const handleAddGroup = useCallback(() => {
        const trimmed = newGroupName.trim();
        if (!trimmed || groups[trimmed]) return;
        setGroups((prev) => ({ ...prev, [trimmed]: { ...DEFAULT_GROUP } }));
        setNewGroupName("");
    }, [newGroupName, groups]);

    const handleDeleteGroup = useCallback(
        (name: string) => {
            setGroups((prev) => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
            if (defaultGroup === name) setDefaultGroup("");
        },
        [defaultGroup],
    );

    const handleSave = useCallback(() => {
        onSave(item.domain, { default: defaultGroup, groups });
    }, [item.domain, onSave, defaultGroup, groups]);

    useEffect(() => {
        registerSave(handleSave);
    }, [registerSave, handleSave]);

    const groupEntries = Object.entries(groups);

    return (
        <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {!item.exists && (
                <Alert severity="warning">
                    설정 파일이 존재하지 않습니다. 저장하면 파일이 생성됩니다.
                </Alert>
            )}

            {groupEntries.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    등록된 그룹이 없습니다. 아래에서 그룹을 추가하세요.
                </Typography>
            )}

            {groupEntries.map(([name, data]) => (
                <GroupEditor
                    key={name}
                    name={name}
                    data={data}
                    isDefault={defaultGroup === name}
                    onChange={(val) => handleGroupChange(name, val)}
                    onDelete={() => handleDeleteGroup(name)}
                    onSetDefault={() => setDefaultGroup(name)}
                />
            ))}

            {/* 그룹 추가 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                    size="small"
                    placeholder="새 그룹 이름"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
                    sx={{ width: 220 }}
                />
                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddGroup}
                    disabled={
                        !newGroupName.trim() || !!groups[newGroupName.trim()]
                    }
                >
                    그룹 추가
                </Button>
            </Box>
        </Box>
    );
};

export default DatabasePage;
