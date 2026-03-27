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
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Close as CloseIcon,
    ContentCopy as CopyIcon,
    Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@ehfuse/alerts";
import { apiKeysApi } from "../../models/api";
import { rolesApi } from "../../../roles/models/api";
import type { ApiKey, ApiKeyCreatedResponse } from "../../models/types/apiKey";

interface ApiKeyDialogProps {
    open: boolean;
    onClose: () => void;
    apiKey?: ApiKey | null;
}

interface CreatedKeyInfo {
    key_value: string;
    hmac_secret: string;
}

const CopyableField = ({ label, value }: { label: string; value: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
                label={label}
                value={value}
                size="small"
                fullWidth
                InputProps={{
                    readOnly: true,
                    style: { fontFamily: "D2Coding", fontSize: "0.8rem" },
                }}
            />
            <Tooltip title={copied ? "복사됨!" : "복사"}>
                <IconButton
                    size="small"
                    onClick={handleCopy}
                    color={copied ? "success" : "default"}
                >
                    <CopyIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    );
};

const ApiKeyDialog = ({ open, onClose, apiKey }: ApiKeyDialogProps) => {
    const isEdit = !!apiKey;
    const queryClient = useQueryClient();

    const [role, setRole] = useState(apiKey?.role ?? "");
    const [description, setDescription] = useState(apiKey?.description ?? "");
    const [enabled, setEnabled] = useState(apiKey?.enabled ?? true);
    const [accountSeq, setUserSeq] = useState<string>(
        apiKey?.account_seq != null ? String(apiKey.account_seq) : "",
    );
    const [entities, setEntities] = useState<string>(
        apiKey?.entities ?? '["*"]',
    );
    const [error, setError] = useState<string | null>(null);
    const [createdKey, setCreatedKey] = useState<CreatedKeyInfo | null>(null);

    // 역할 목록 조회
    const { data: rolesData } = useQuery({
        queryKey: ["roles", 1, 100],
        queryFn: () => rolesApi.getRoles({ page: 1, page_size: 100 }),
        enabled: open,
    });
    const roleNames = rolesData?.items.map((r) => r.name) ?? [];

    const createMutation = useMutation({
        mutationFn: () =>
            apiKeysApi.createApiKey({
                role,
                description,
                enabled,
                account_seq: accountSeq !== "" ? Number(accountSeq) : null,
                entities: entities.trim() || '["*"]',
            }),
        onSuccess: (resp) => {
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            const data = resp.data as ApiKeyCreatedResponse;
            setCreatedKey({
                key_value: data.key_value,
                hmac_secret: data.hmac_secret,
            });
        },
        onError: (e: Error) =>
            setError(e.message || "API 키 생성에 실패했습니다."),
    });

    const updateMutation = useMutation({
        mutationFn: () =>
            apiKeysApi.updateApiKey(apiKey!.seq, {
                role,
                description,
                enabled,
                account_seq: accountSeq !== "" ? Number(accountSeq) : null,
                entities: entities.trim() || '["*"]',
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            onClose();
        },
        onError: (e: Error) =>
            setError(e.message || "API 키 수정에 실패했습니다."),
    });

    const regenerateMutation = useMutation({
        mutationFn: () => apiKeysApi.regenerateSecret(apiKey!.seq),
        onSuccess: (resp) => {
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            const data = resp.data as ApiKeyCreatedResponse;
            setCreatedKey({
                key_value: data.key_value,
                hmac_secret: data.hmac_secret,
            });
        },
        onError: (e: Error) =>
            setError(e.message || "Secret 재생성에 실패했습니다."),
    });

    const isPending =
        createMutation.isPending ||
        updateMutation.isPending ||
        regenerateMutation.isPending;

    const handleSubmit = () => {
        setError(null);
        if (!role) {
            setError("역할을 선택하세요.");
            return;
        }
        if (isEdit) updateMutation.mutate();
        else createMutation.mutate();
    };

    const handleRegenerate = async () => {
        const confirmed = await ConfirmDialog({
            message:
                "HMAC Secret을 재생성하면 기존 키를 사용하는 연동이 중단됩니다.\n계속하시겠습니까?",
            confirmText: "재생성",
        });
        if (confirmed) regenerateMutation.mutate();
    };

    const handleClose = () => {
        setCreatedKey(null);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <Typography variant="h6">
                        {isEdit ? "API 키 수정" : "API 키 추가"}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {isEdit && (
                            <>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    활성
                                </Typography>
                                <Switch
                                    checked={enabled}
                                    onChange={(e) =>
                                        setEnabled(e.target.checked)
                                    }
                                    size="small"
                                />
                            </>
                        )}
                        <Tooltip title="닫기">
                            <IconButton size="small" onClick={handleClose}>
                                <CloseIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
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

                    {/* 생성/재생성 후 평문 노출 */}
                    {createdKey && (
                        <Alert
                            severity="success"
                            icon={false}
                            sx={{ flexDirection: "column", gap: 1 }}
                        >
                            <Typography
                                variant="body2"
                                sx={{ mb: 1, fontWeight: 600 }}
                            >
                                ⚠️ 아래 키는 지금만 확인할 수 있습니다. 안전한
                                곳에 보관하세요.
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                <CopyableField
                                    label="API Key"
                                    value={createdKey.key_value}
                                />
                                <CopyableField
                                    label="HMAC Secret"
                                    value={createdKey.hmac_secret}
                                />
                            </Box>
                        </Alert>
                    )}

                    {/* 수정 모드: 현재 키 미리보기 (마스킹) */}
                    {isEdit && !createdKey && (
                        <TextField
                            label="API Key (앞 8자리만 노출)"
                            value={apiKey?.key_value ?? ""}
                            size="small"
                            fullWidth
                            InputProps={{
                                readOnly: true,
                                style: { fontFamily: "D2Coding" },
                            }}
                        />
                    )}

                    <FormControl size="small" fullWidth>
                        <InputLabel>역할 (Role)</InputLabel>
                        <Select
                            value={role}
                            label="역할 (Role)"
                            onChange={(e) => setRole(e.target.value)}
                        >
                            {roleNames.length === 0 ? (
                                <MenuItem value="" disabled>
                                    역할 목록 로딩 중...
                                </MenuItem>
                            ) : (
                                roleNames.map((r) => (
                                    <MenuItem key={r} value={r}>
                                        {r}
                                    </MenuItem>
                                ))
                            )}
                        </Select>
                    </FormControl>

                    <TextField
                        label="설명 (description)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                    />

                    <TextField
                        label="사용자 seq (account_seq, 선택사항)"
                        value={accountSeq}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) setUserSeq(v);
                        }}
                        size="small"
                        fullWidth
                        placeholder="비워두면 시스템 키로 처리"
                        inputProps={{ inputMode: "numeric" }}
                    />

                    <TextField
                        label="허용 엔티티 (entities JSON)"
                        value={entities}
                        onChange={(e) => setEntities(e.target.value)}
                        size="small"
                        fullWidth
                        placeholder='["*"] 또는 ["user","product"]'
                        inputProps={{
                            style: {
                                fontFamily: "D2Coding",
                                fontSize: "0.85rem",
                            },
                        }}
                        helperText='["*"] 입력 시 전체 엔티티 허용'
                    />

                    {/* 재생성 버튼 (수정 모드에서만) */}
                    {isEdit && (
                        <Box>
                            <Button
                                variant="outlined"
                                color="warning"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={handleRegenerate}
                                disabled={isPending}
                            >
                                HMAC Secret 재생성
                            </Button>
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleClose} disabled={isPending}>
                    {createdKey ? "닫기" : "취소"}
                </Button>
                {!createdKey && (
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
                )}
            </DialogActions>
        </Dialog>
    );
};

export default ApiKeyDialog;
