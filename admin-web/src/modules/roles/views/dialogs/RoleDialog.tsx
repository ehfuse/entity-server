import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { Close as CloseIcon } from "@mui/icons-material";

const AVAILABLE_PERMISSIONS: { value: string; label: string }[] = [
    // 와일드카드
    { value: "*", label: "* (모든 권한)" },
    { value: "entity:*", label: "entity:* (Entity API 전체)" },
    { value: "admin:*", label: "admin:* (Admin API 전체)" },
    // Entity 권한
    { value: "entity:meta", label: "entity:meta (메타 조회)" },
    { value: "entity:validate", label: "entity:validate (유효성 검증)" },
    { value: "entity:read", label: "entity:read (단건 조회)" },
    { value: "entity:list", label: "entity:list (목록 조회)" },
    { value: "entity:count", label: "entity:count (조건별 개수)" },
    { value: "entity:query", label: "entity:query (커스텀 쿼리)" },
    { value: "entity:create", label: "entity:create (생성/수정)" },
    { value: "entity:delete", label: "entity:delete (삭제)" },
    { value: "entity:history", label: "entity:history (이력 조회)" },
    { value: "entity:rollback", label: "entity:rollback (롤백)" },
    // Admin 권한
    { value: "admin:entities", label: "admin:entities (엔티티 목록 조회)" },
    { value: "admin:configs", label: "admin:configs (설정 조회/수정)" },
    { value: "admin:roles", label: "admin:roles (역할 관리)" },
    { value: "admin:api-keys", label: "admin:api-keys (API 키 관리)" },
    { value: "admin:users", label: "admin:users (사용자 관리)" },
    { value: "admin:stats", label: "admin:stats (통계 조회)" },
    { value: "admin:reindex", label: "admin:reindex (인덱스 재구축)" },
    { value: "admin:sync-schema", label: "admin:sync-schema (스키마 동기화)" },
    { value: "admin:reset", label: "admin:reset (테이블 초기화)" },
    { value: "admin:truncate", label: "admin:truncate (데이터 비우기)" },
    { value: "admin:drop", label: "admin:drop (엔티티 삭제)" },
    { value: "admin:reset-all", label: "admin:reset-all (전체 초기화)" },
];
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "../../models/api";
import type { RbacRole } from "../../models/types/role";

interface RoleDialogProps {
    open: boolean;
    onClose: () => void;
    role?: RbacRole | null;
}

/** permissions 값을 string[] 로 안전하게 파싱 */
const parsePermissions = (raw: string | string[] | undefined): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
};

const RoleDialog = ({ open, onClose, role }: RoleDialogProps) => {
    const isEdit = !!role;
    const queryClient = useQueryClient();

    const [name, setName] = useState(role?.name ?? "");
    const [description, setDescription] = useState(role?.description ?? "");
    const [permissions, setPermissions] = useState<string[]>(
        parsePermissions(role?.permissions),
    );
    const [error, setError] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: () =>
            rolesApi.createRole({ name, description, permissions }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            onClose();
        },
        onError: (e: Error) =>
            setError(e.message || "역할 생성에 실패했습니다."),
    });

    const updateMutation = useMutation({
        mutationFn: () =>
            rolesApi.updateRole(role!.seq, { name, description, permissions }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            onClose();
        },
        onError: (e: Error) =>
            setError(e.message || "역할 수정에 실패했습니다."),
    });

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleDeletePermission = (perm: string) => {
        setPermissions((prev) => prev.filter((p) => p !== perm));
    };

    const handleSubmit = () => {
        setError(null);
        if (!name.trim()) {
            setError("역할 이름을 입력하세요.");
            return;
        }
        if (isEdit) updateMutation.mutate();
        else createMutation.mutate();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <Typography variant="h6">
                        {isEdit ? "역할 수정" : "역할 추가"}
                    </Typography>
                    <Tooltip title="닫기">
                        <IconButton size="small" onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        pt: 1,
                    }}
                >
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="역할 이름 (name)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        size="small"
                        fullWidth
                        autoFocus
                        inputProps={{ style: { fontFamily: "D2Coding" } }}
                    />

                    <TextField
                        label="설명 (description)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                    />

                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ mb: 1, color: "text.secondary" }}
                        >
                            권한 (permissions)
                        </Typography>
                        <Autocomplete
                            options={AVAILABLE_PERMISSIONS.filter(
                                (p) => !permissions.includes(p.value),
                            )}
                            getOptionLabel={(opt) => opt.label}
                            value={null}
                            onChange={(_e, val) => {
                                if (val && !permissions.includes(val.value)) {
                                    setPermissions((prev) => [
                                        ...prev,
                                        val.value,
                                    ]);
                                }
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="권한 선택"
                                    size="small"
                                    fullWidth
                                    inputProps={{
                                        ...params.inputProps,
                                        style: { fontFamily: "D2Coding" },
                                    }}
                                />
                            )}
                            sx={{ mb: 1 }}
                            blurOnSelect
                            clearOnBlur
                        />
                        <Box
                            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                        >
                            {permissions.length === 0 ? (
                                <Typography
                                    variant="caption"
                                    sx={{ color: "text.disabled" }}
                                >
                                    권한이 없습니다.
                                </Typography>
                            ) : (
                                permissions.map((perm) => (
                                    <Chip
                                        key={perm}
                                        label={perm}
                                        size="small"
                                        onDelete={() =>
                                            handleDeletePermission(perm)
                                        }
                                        sx={{
                                            fontFamily: "D2Coding",
                                            fontWeight: 600,
                                        }}
                                    />
                                ))
                            )}
                        </Box>
                    </Box>
                </Box>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} disabled={isPending}>
                    취소
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={isPending}
                    startIcon={
                        isPending ? (
                            <CircularProgress size={16} color="inherit" />
                        ) : undefined
                    }
                >
                    {isEdit ? "저장" : "추가"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default RoleDialog;
