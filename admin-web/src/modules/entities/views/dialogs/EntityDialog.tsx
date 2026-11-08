import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip,
    Typography,
} from "@mui/material";
import { SuccessAlert } from "@ehfuse/alerts";
import {
    Close as CloseIcon,
    HelpOutline as HelpOutlineIcon,
} from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { entitiesApi } from "../../models/api";
import type { Entity } from "../../models/types/entity";

const CREATE_TEMPLATE = `{
    "name": "",
    "description": "",
    "enabled": true,
    "db_group": "",
    "index": {
        "field_name": {
            "type": "varchar(255)",
            "comment": "",
            "required": false,
            "nullable": false,
            "unique": false,
            "hash": false,
            "default": null
        }
    },
    "hash": [],
    "required": [],
    "nullable": [],
    "unique": [],
    "types": {},
    "comments": {},
    "defaults": {},
    "fk": {},
    "optimistic_lock": false,
    "history_ttl": 94608000,
    "license_scope": true,
    "hard_delete": false,
    "cache": {
        "enabled": false,
        "ttl_seconds": 0
    },
    "reset_defaults": [],
    "hooks": {
        "before_insert": [],
        "after_insert": [],
        "before_update": [],
        "after_update": [],
        "before_delete": [],
        "after_delete": [],
        "after_get": [],
        "after_list": []
    }
}`;

interface EntityDialogProps {
    open: boolean;
    onClose: () => void;
    /** 수정 모드일 때 기존 엔티티 전달. 없으면 신규 생성 모드 */
    entity?: Entity | null;
    /** 신규 생성 시 중복 체크용 기존 엔티티 이름 목록 */
    existingNames?: string[];
}

const EntityDialog = ({
    open,
    onClose,
    entity,
    existingNames = [],
}: EntityDialogProps) => {
    // 닫히는 애니메이션 중에도 마지막 entity 값을 유지 (깜빡임 방지)
    const latchedEntityRef = useRef<Entity | null | undefined>(entity);
    if (open && entity) latchedEntityRef.current = entity;
    const activeEntity = open ? entity : latchedEntityRef.current;
    const isEditing = !!activeEntity;

    const [jsonText, setJsonText] = useState("{}");
    const [jsonError, setJsonError] = useState("");
    const [saving, setSaving] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        if (!open) return;
        setJsonError("");
        if (isEditing && entity) {
            setLoadingConfig(true);
            entitiesApi
                .getEntityConfigRaw(activeEntity.name)
                .then((raw) => setJsonText(raw))
                .catch(() => setJsonError("설정 파일을 불러오지 못했습니다."))
                .finally(() => setLoadingConfig(false));
        } else {
            setJsonText(CREATE_TEMPLATE);
        }
    }, [open, isEditing, activeEntity, entity]);

    const handleJsonChange = (val: string | undefined) => {
        const text = val ?? "";
        setJsonText(text);
        try {
            JSON.parse(text);
            setJsonError("");
        } catch (e) {
            if (e instanceof SyntaxError) {
                setJsonError(`JSON 문법 오류: ${e.message}`);
            }
        }
    };

    const handleFormat = () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
        setJsonError("");
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setJsonError("");
            const currentText = editorRef.current?.getValue() ?? jsonText;
            await entitiesApi.validateEntityConfigRaw(
                currentText,
                isEditing ? activeEntity!.name : undefined,
            );
            const normalizedRes = await entitiesApi.normalizeEntityConfigRaw(
                currentText,
                isEditing ? activeEntity!.name : undefined,
            );
            const normalizedText = normalizedRes.data?.json ?? currentText;
            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(normalizedText) as Record<string, unknown>;
            } catch {
                setJsonError("서버 정규화 결과를 파싱하지 못했습니다.");
                return;
            }

            if (isEditing) {
                const res = await entitiesApi.updateEntityConfigRaw(
                    activeEntity!.name,
                    normalizedText,
                );
                const data = res as { action?: string; indexed?: number };
                const action = data?.action ?? "saved";
                if (action === "reindex") {
                    SuccessAlert(
                        data.indexed !== undefined
                            ? `재색인 완료 (${data.indexed}건)`
                            : "재색인 완료",
                    );
                } else if (action === "sync-schema") {
                    SuccessAlert("스키마 동기화 완료");
                }
            } else {
                const newName = String(parsed.name ?? "").trim();
                if (!newName) {
                    setJsonError("name 필드를 입력해주세요.");
                    return;
                }
                if (existingNames.includes(newName)) {
                    setJsonError(
                        `'${newName}' 이름의 엔티티가 이미 존재합니다.`,
                    );
                    return;
                }
                await entitiesApi.createEntityConfigRaw(
                    newName,
                    normalizedText,
                );
                SuccessAlert(`'${newName}' 엔티티가 생성되었습니다.`);
            }
            onClose();
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "저장 중 오류가 발생했습니다.";
            setJsonError(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    pr: 2,
                }}
            >
                <Typography variant="h6" component="span">
                    {isEditing ? activeEntity!.name : "새 엔티티 만들기"}
                </Typography>
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                {jsonError && (
                    <Alert severity="error" sx={{ m: 2 }}>
                        {jsonError}
                    </Alert>
                )}
                {loadingConfig ? (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "80vh",
                        }}
                    >
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ bgcolor: "#1e1e1e" }}>
                        <Editor
                            height="80vh"
                            language="json"
                            theme="vs-dark"
                            value={jsonText}
                            onChange={handleJsonChange}
                            onMount={(editor) => {
                                editorRef.current = editor;
                            }}
                            options={{
                                fontSize: 14,
                                fontFamily: "D2Coding",
                                tabSize: 4,
                                insertSpaces: true,
                                minimap: { enabled: true },
                                scrollBeyondLastLine: false,
                                formatOnPaste: true,
                                bracketPairColorization: { enabled: true },
                                guides: { bracketPairs: false },
                                padding: { top: 8, bottom: 8 },
                            }}
                        />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ display: "flex", alignItems: "center" }}>
                <Tooltip title="엔티티 설정 가이드" arrow>
                    <IconButton
                        size="small"
                        onClick={() =>
                            window.open(
                                "https://ehfuse.github.io/entity-server/entity-config-guide.html",
                                "_blank",
                                "noopener,noreferrer",
                            )
                        }
                    >
                        <HelpOutlineIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Button
                    onClick={handleFormat}
                    disabled={saving || loadingConfig}
                >
                    Format
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button onClick={onClose} disabled={saving}>
                    취소
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || loadingConfig}
                    startIcon={
                        saving ? <CircularProgress size={16} /> : undefined
                    }
                >
                    {saving ? "저장 중..." : isEditing ? "저장" : "만들기"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EntityDialog;
