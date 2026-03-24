import { TextField } from "@ehfuse/mui-form-controls";
import { Box, Switch, Tooltip, Typography } from "@mui/material";

interface ConfigFieldProps {
    fieldKey: string;
    value: unknown;
    onChange: (key: string, val: unknown) => void;
    description?: string;
}

const ConfigField = ({
    fieldKey,
    value,
    onChange,
    description,
}: ConfigFieldProps) => {
    const isBool = typeof value === "boolean";
    const isObj = typeof value === "object" && value !== null;

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: isObj ? "flex-start" : "center",
                gap: 2,
                py: 1,
            }}
        >
            <Box sx={{ minWidth: 220, flexShrink: 0, pt: isObj ? 0.5 : 0 }}>
                <Tooltip
                    title={description ?? ""}
                    placement="top"
                    arrow
                    disableHoverListener={!description}
                >
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 600,
                            color: "#334155",
                            fontFamily: "D2Coding",
                            cursor: description ? "help" : "default",
                            display: "inline",
                        }}
                    >
                        {fieldKey}
                    </Typography>
                </Tooltip>
            </Box>

            {isBool ? (
                <Switch
                    size="medium"
                    checked={value as boolean}
                    onChange={(e) => onChange(fieldKey, e.target.checked)}
                />
            ) : isObj ? (
                <TextField
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={8}
                    value={JSON.stringify(value, null, 2)}
                    onChange={(e) => {
                        try {
                            onChange(fieldKey, JSON.parse(e.target.value));
                        } catch {
                            onChange(fieldKey, e.target.value);
                        }
                    }}
                    // sx={{
                    //     "& .MuiInputBase-input": {
                    //         fontFamily: "D2Coding",
                    //         fontSize: "0.82rem",
                    //     },
                    // }}
                />
            ) : (
                <TextField
                    size="small"
                    fullWidth
                    value={
                        value === null || value === undefined
                            ? ""
                            : String(value)
                    }
                    type={typeof value === "number" ? "number" : "text"}
                    onChange={(e) => {
                        const raw = e.target.value;
                        onChange(
                            fieldKey,
                            typeof value === "number" ? Number(raw) : raw,
                        );
                    }}
                    // sx={{
                    //     "& .MuiInputBase-input": {
                    //         fontFamily: "D2Coding",
                    //         fontSize: "0.85rem",
                    //     },
                    // }}
                />
            )}
        </Box>
    );
};

export default ConfigField;
