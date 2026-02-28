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
import { accountsApi } from "../../models/api";
import type { Account } from "../../models/types/account";

interface AccountDialogProps {
    open: boolean;
    onClose: () => void;
    /** 수정 모드일 때 기존 사용자 전달. 없으면 신규 생성 */
    user?: Account | null;
}

const UserDialog = ({ open, onClose, user }: AccountDialogProps) => {
    const isEdit = !!user;

    const [email, setEmail] = useState(user?.email ?? "");
    const [rbacRole, setRbacRole] = useState(user?.rbac_role ?? "");
    const [status, setStatus] = useState(user?.status ?? "active");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: () =>
            accountsApi.createAccount({
                email,
                rbac_role: rbacRole,
                status,
                password,
            }),
        onSuccess: () => onClose(),
        onError: (e: Error) =>
            setError(e.message || "사용자 생성에 실패했습니다."),
    });

    const updateMutation = useMutation({
        mutationFn: () =>
            accountsApi.updateAccount(user!.id, {
                email,
                rbac_role: rbacRole,
                status,
                ...(password ? { password } : {}),
            }),
        onSuccess: () => onClose(),
        onError: (e: Error) =>
            setError(e.message || "사용자 수정에 실패했습니다."),
    });

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleSubmit = () => {
        setError(null);
        if (!email.trim()) {
            setError("이메일을 입력하세요.");
            return;
        }
        if (!isEdit && !password) {
            setError("비밀번호를 입력하세요.");
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
                        {isEdit ? "계정 수정" : "계정 추가"}
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
                        label="이메일"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        size="medium"
                        fullWidth
                        autoFocus
                    />

                    <FormControl size="small" fullWidth>
                        <InputLabel>RBAC 역할</InputLabel>
                        <Select
                            value={rbacRole}
                            label="RBAC 역할"
                            onChange={(e) => setRbacRole(e.target.value)}
                        >
                            {[
                                "admin",
                                "editor",
                                "viewer",
                                "auditor",
                                "user",
                            ].map((r) => (
                                <MenuItem key={r} value={r}>
                                    {r}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        label={
                            isEdit ? "새 비밀번호 (변경 시만 입력)" : "비밀번호"
                        }
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        size="medium"
                        fullWidth
                    />

                    <FormControl size="small" fullWidth>
                        <InputLabel>상태</InputLabel>
                        <Select
                            value={status}
                            label="상태"
                            onChange={(e) => setStatus(e.target.value)}
                        >
                            <MenuItem value="active">활성</MenuItem>
                            <MenuItem value="inactive">비활성</MenuItem>
                            <MenuItem value="blocked">차단</MenuItem>
                        </Select>
                    </FormControl>
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

export default UserDialog;
