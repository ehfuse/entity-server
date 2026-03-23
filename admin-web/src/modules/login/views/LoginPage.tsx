import { useEffect, useState } from "react";
import {
    Box,
    Card,
    CardContent,
    Button,
    Typography,
    Alert,
    Checkbox,
    FormControlLabel,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { PasswordTextField, EmailTextField } from "@ehfuse/mui-form-controls";
import { useLoginController } from "../controllers/loginController";

const DEFAULT_EMAIL_DOMAIN = __DEFAULT_EMAIL_DOMAIN__;
const LOGIN_SAVED_EMAIL_KEY = "login_saved_email";

const LoginPage = () => {
    const navigate = useNavigate();
    const { form } = useLoginController();
    const [error, setError] = useState("");
    const [serverChecking, setServerChecking] = useState(true);
    const [serverDown, setServerDown] = useState(false);
    const [rememberEmail, setRememberEmail] = useState<boolean>(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return !!localStorage.getItem(LOGIN_SAVED_EMAIL_KEY);
    });

    const email = form.useFormValue("email") as string;
    const passwd = form.useFormValue("passwd") as string;

    useEffect(() => {
        form.setFormValue("passwd", "");
        const savedEmail = localStorage.getItem(LOGIN_SAVED_EMAIL_KEY) || "";
        if (savedEmail) {
            form.setFormValue("email", savedEmail);
            setRememberEmail(true);
        }

        const checkServer = async () => {
            setServerChecking(true);
            try {
                const { entityServer } = await import("entity-server-client");
                const health = await entityServer.checkHealth();
                setServerDown(!health.ok);
            } catch {
                setServerDown(true);
            } finally {
                setServerChecking(false);
            }
        };

        checkServer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRememberEmailChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const checked = event.target.checked;
        setRememberEmail(checked);
        if (!checked) {
            localStorage.removeItem(LOGIN_SAVED_EMAIL_KEY);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (serverDown) {
            setError(
                "서버에 연결할 수 없습니다. 서버 실행 상태를 먼저 확인하세요.",
            );
            return;
        }

        const isValid = await form.validateForm();
        if (!isValid) {
            setError("이메일과 비밀번호를 입력하세요.");
            return;
        }

        try {
            const ok = await form.submit();
            if (ok) {
                if (rememberEmail) {
                    localStorage.setItem(LOGIN_SAVED_EMAIL_KEY, email || "");
                } else {
                    localStorage.removeItem(LOGIN_SAVED_EMAIL_KEY);
                }
                navigate("/dashboard");
            } else {
                setError("이메일 또는 비밀번호가 올바르지 않습니다.");
            }
        } catch (err: unknown) {
            const e = err as {
                response?: { data?: { message?: string; error?: string } };
            };
            setError(
                e.response?.data?.message ||
                    e.response?.data?.error ||
                    "로그인 중 오류가 발생했습니다.",
            );
        }
    };

    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "100vh",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
        >
            <Card sx={{ width: 400, boxShadow: 4 }}>
                <CardContent sx={{ p: 4 }}>
                    <Typography
                        variant="h4"
                        align="center"
                        gutterBottom
                        fontWeight="bold"
                    >
                        Entity Admin
                    </Typography>

                    <Box
                        component="form"
                        onSubmit={handleSubmit}
                        sx={{ mt: 3 }}
                    >
                        {serverChecking && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                서버 연결 상태를 확인하는 중...
                            </Alert>
                        )}

                        {serverDown && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Entity Server에 연결할 수 없습니다. 서버를 먼저
                                실행하세요.
                            </Alert>
                        )}

                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <EmailTextField
                            fullWidth
                            label="이메일"
                            name="email"
                            value={email}
                            onChange={form.handleFormChange}
                            autoComplete="username"
                            autoFocus={!rememberEmail}
                            margin="normal"
                            domains={[DEFAULT_EMAIL_DOMAIN]}
                            required
                        />

                        <PasswordTextField
                            fullWidth
                            label="비밀번호"
                            name="passwd"
                            value={passwd}
                            onChange={form.handleFormChange}
                            autoComplete="new-password"
                            autoFocus={rememberEmail}
                            margin="normal"
                            required
                        />

                        <FormControlLabel
                            sx={{ mt: 1 }}
                            control={
                                <Checkbox
                                    checked={rememberEmail}
                                    onChange={handleRememberEmailChange}
                                />
                            }
                            label="아이디 기억하기"
                        />

                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={
                                form.isSubmitting ||
                                serverDown ||
                                serverChecking
                            }
                            sx={{ mt: 3 }}
                        >
                            {form.isSubmitting ? "로그인 중..." : "로그인"}
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
};

export default LoginPage;
