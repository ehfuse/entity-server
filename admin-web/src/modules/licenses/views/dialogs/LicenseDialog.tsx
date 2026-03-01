import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useMutation } from "@tanstack/react-query";
import { DateTextField, NumberTextField } from "@ehfuse/mui-form-controls";
import { licensesApi } from "../../models/api";
import type {
    License,
    LicenseScope,
    LicenseStatus,
} from "../../models/types/license";

const SCOPES: LicenseScope[] = ["global", "entity"];
const STATUSES: LicenseStatus[] = ["active", "pending", "suspended", "expired"];

interface LicenseDialogProps {
    open: boolean;
    onClose: () => void;
    license?: License | null;
}

const LicenseDialog = ({ open, onClose, license }: LicenseDialogProps) => {
    const isEdit = !!license;

    const [key, setKey] = useState(license?.key ?? "");
    const [description, setDescription] = useState(license?.description ?? "");
    const [scope, setScope] = useState<LicenseScope>(
        license?.scope ?? "global",
    );
    const [entities, setEntities] = useState(
        (license?.entities ?? []).join(","),
    );
    const [allowedRoles, setAllowedRoles] = useState(
        (license?.allowed_roles ?? []).join(","),
    );
    const [maxRecords, setMaxRecords] = useState<string>(
        license?.max_records != null ? String(license.max_records) : "",
    );
    const [status, setStatus] = useState<LicenseStatus>(
        license?.status ?? "active",
    );
    const [expiresAt, setExpiresAt] = useState(
        license?.expires_at ? license.expires_at.slice(0, 10) : "",
    );
    const [error, setError] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: () =>
            licensesApi.createLicense({
                key,
                description,
                scope,
                entities:
                    scope === "entity"
                        ? entities
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                        : undefined,
                allowed_roles: allowedRoles
                    ? allowedRoles
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                    : undefined,
                max_records: maxRecords ? Number(maxRecords) : undefined,
                status,
                expires_at: expiresAt || undefined,
            }),
        onSuccess: () => onClose(),
        onError: (e: Error) =>
            setError(e.message || "라이선스 생성에 실패했습니다."),
    });

    const updateMutation = useMutation({
        mutationFn: () =>
            licensesApi.updateLicense(license!.id, {
                description,
                scope,
                entities:
                    scope === "entity"
                        ? entities
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                        : undefined,
                allowed_roles: allowedRoles
                    ? allowedRoles
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                    : undefined,
                max_records: maxRecords ? Number(maxRecords) : undefined,
                status,
                expires_at: expiresAt || undefined,
            }),
        onSuccess: () => onClose(),
        onError: (e: Error) =>
            setError(e.message || "라이선스 수정에 실패했습니다."),
    });

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleSubmit = () => {
        setError(null);
        if (!isEdit && !key.trim()) {
            setError("라이선스 키를 입력하세요.");
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
                        {isEdit ? "라이선스 수정" : "라이선스 추가"}
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
                        label="라이선스 키"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        size="small"
                        fullWidth
                        disabled={isEdit}
                        autoFocus={!isEdit}
                        inputProps={{ style: { fontFamily: "D2Coding" } }}
                    />

                    <TextField
                        label="설명"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        size="small"
                        fullWidth
                    />

                    <Box sx={{ display: "flex", gap: 2 }}>
                        <FormControl size="small" sx={{ width: 160 }}>
                            <InputLabel>범위 (Scope)</InputLabel>
                            <Select
                                value={scope}
                                label="범위 (Scope)"
                                onChange={(e) =>
                                    setScope(e.target.value as LicenseScope)
                                }
                            >
                                {SCOPES.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ width: 160 }}>
                            <InputLabel>상태</InputLabel>
                            <Select
                                value={status}
                                label="상태"
                                onChange={(e) =>
                                    setStatus(e.target.value as LicenseStatus)
                                }
                            >
                                {STATUSES.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {scope === "entity" && (
                        <TextField
                            label="대상 엔티티 (쉼표 구분)"
                            value={entities}
                            onChange={(e) => setEntities(e.target.value)}
                            size="small"
                            fullWidth
                            placeholder="user,post,..."
                            helperText="빈 값이면 전체 엔티티 적용"
                        />
                    )}

                    <TextField
                        label="허용 역할 (쉼표 구분, 빈 값=전체)"
                        value={allowedRoles}
                        onChange={(e) => setAllowedRoles(e.target.value)}
                        size="small"
                        fullWidth
                        placeholder="admin,editor,..."
                    />

                    <NumberTextField
                        label="최대 레코드 수 (빈 값=무제한)"
                        value={maxRecords}
                        onChange={(e) => setMaxRecords(e.target.value)}
                        thousandSeparator={false}
                        size="small"
                        fullWidth
                    />

                    <DateTextField
                        label="만료일"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        size="small"
                        fullWidth
                        helperText="비워두면 만료 없음"
                    />
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

export default LicenseDialog;
