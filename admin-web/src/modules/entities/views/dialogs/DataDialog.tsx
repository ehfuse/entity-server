import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    IconButton,
    Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import {
    TextField,
    TextArea,
    DateTextField,
    DateTimeTextField,
} from "@ehfuse/mui-form-controls";
import { useGlobalForm } from "@ehfuse/forma";
import { formatDateTime } from "../../../shared/utils/dateTime";

interface EntityDataDialogProps {
    open: boolean;
    onClose: () => void;
    entityName: string;
    record: Record<string, unknown> | null;
    onSave?: (updated: Record<string, unknown>) => Promise<void> | void;
}

const toStringRecord = (rec: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(
        Object.entries(rec).map(([k, v]) => [
            k,
            v === null || v === undefined
                ? ""
                : typeof v === "object"
                  ? JSON.stringify(v)
                  : String(v),
        ]),
    );

const EntityDataDialog = ({
    open,
    onClose,
    entityName,
    record,
    onSave,
}: EntityDataDialogProps) => {
    const [saving, setSaving] = useState(false);

    const form = useGlobalForm<Record<string, string>>({
        formId: `entityDataForm_${entityName}`,
        initialValues: record ? toStringRecord(record) : {},
    });

    const formRef = useRef(form);
    formRef.current = form;

    useEffect(() => {
        if (open && record) {
            formRef.current.setFormValues(toStringRecord(record));
        }
    }, [open, record]);

    const handleSave = async () => {
        if (!onSave) return;
        setSaving(true);
        try {
            await onSave(form.getFormValues());
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const entries = record ? Object.entries(record) : [];
    const seqValue = record?.seq ?? record?.id ?? "";
    const isReadonlyKey = (key: string) =>
        key === "id" ||
        key === "seq" ||
        key === "created_time" ||
        key === "updated_time" ||
        key === "deleted_time";

    const isSystemTimeKey = (key: string) =>
        key === "created_time" ||
        key === "updated_time" ||
        key === "deleted_time";

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
                    {entityName}.seq = {String(seqValue)}
                </Typography>
                <IconButton onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {entries.length === 0 ? (
                    <Typography color="text.secondary">
                        표시할 데이터가 없습니다.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            pt: 1,
                        }}
                    >
                        {entries
                            .filter(([key]) => key !== "seq")
                            .sort(([a], [b]) => {
                                const aLast = isSystemTimeKey(a) ? 1 : 0;
                                const bLast = isSystemTimeKey(b) ? 1 : 0;
                                return aLast - bLast;
                            })
                            .map(([key]) => {
                                const ro = isReadonlyKey(key);
                                if (isSystemTimeKey(key)) {
                                    const raw =
                                        (form.getFormValue(key) as string) ??
                                        "";
                                    const display = formatDateTime(raw);
                                    return (
                                        <TextField
                                            key={key}
                                            label={key}
                                            value={
                                                display === "-" ? raw : display
                                            }
                                            disabled
                                            readonly
                                            size="medium"
                                            fullWidth
                                        />
                                    );
                                }
                                if (key.endsWith("_time")) {
                                    return (
                                        <DateTimeTextField
                                            key={key}
                                            label={key}
                                            name={key}
                                            form={form}
                                            disabled={ro}
                                            readonly={ro}
                                            fullWidth
                                        />
                                    );
                                }
                                if (key.endsWith("_date")) {
                                    return (
                                        <DateTextField
                                            key={key}
                                            label={key}
                                            name={key}
                                            form={form}
                                            disabled={ro}
                                            readonly={ro}
                                            fullWidth
                                        />
                                    );
                                }
                                const val =
                                    (form.getFormValue(key) as string) ?? "";
                                if (val.includes("\n")) {
                                    return (
                                        <TextArea
                                            key={key}
                                            label={key}
                                            name={key}
                                            form={form}
                                            disabled={ro}
                                            readonly={ro}
                                            fullWidth
                                            minRows={3}
                                        />
                                    );
                                }
                                return (
                                    <TextField
                                        key={key}
                                        label={key}
                                        name={key}
                                        form={form}
                                        disabled={ro}
                                        readonly={ro}
                                        size="medium"
                                        fullWidth
                                    />
                                );
                            })}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving} size="large">
                    취소
                </Button>
                <Button
                    variant="contained"
                    size="large"
                    onClick={handleSave}
                    disabled={saving || !onSave}
                >
                    저장
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EntityDataDialog;
