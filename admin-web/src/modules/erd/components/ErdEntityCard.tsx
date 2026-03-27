import { Box, Divider, Stack, Typography } from "@mui/material";
import Paper from "@mui/material/Paper";
import { styled } from "@mui/material/styles";
import { forwardRef } from "react";

export type InferredFKField = {
    field: string;
    targetEntity: string;
};

export type EntityIndexField = {
    name: string;
    isUnique: boolean;
};

type ErdEntityCardProps = {
    entityName: string;
    fkFields: InferredFKField[];
    indexFields: EntityIndexField[];
};

const StyledPaper = styled(Paper)(({ theme }) => ({
    backgroundColor: "#fff",
    ...theme.typography.body2,
    padding: 0,
    width: "100%",
    overflow: "visible",
    color: (theme.vars || theme).palette.text.secondary,
    border: `1px solid ${(theme.vars || theme).palette.divider}`,
    fontFamily: "D2Coding",
    ...theme.applyStyles("dark", {
        backgroundColor: "#1A2027",
    }),
}));

export const ErdEntityCard = forwardRef<HTMLDivElement, ErdEntityCardProps>(
    ({ entityName, fkFields, indexFields }, ref) => {
        return (
            <StyledPaper ref={ref}>
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        color="text.primary"
                    >
                        {entityName}
                    </Typography>
                </Box>
                <Divider />

                <Box sx={{ px: 2, py: 1.5 }}>
                    <Stack spacing={0.5}>
                        <Box
                            sx={{
                                position: "relative",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            {/* 초록 동그라미: seq 도착점 */}
                            <Box
                                sx={{
                                    position: "absolute",
                                    left: -20,
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    bgcolor: "#4caf50",
                                    border: "2px solid #fff",
                                    boxShadow: "0 0 0 1.5px #4caf50",
                                    flexShrink: 0,
                                }}
                            />
                            <Typography variant="body2" data-seq-field="true">
                                seq (PK)
                            </Typography>
                        </Box>
                        {fkFields.length > 0 ? (
                            <>
                                {fkFields.map((fk) => (
                                    <Box
                                        key={`${entityName}:${fk.field}`}
                                        sx={{
                                            position: "relative",
                                            display: "flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        {/* 파란 동그라미: FK 출발점 */}
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                right: -20,
                                                width: 10,
                                                height: 10,
                                                borderRadius: "50%",
                                                bgcolor: "#2196f3",
                                                border: "2px solid #fff",
                                                boxShadow:
                                                    "0 0 0 1.5px #2196f3",
                                                flexShrink: 0,
                                            }}
                                        />
                                        <Typography
                                            variant="body2"
                                            data-fk-field={fk.field}
                                            data-fk-target={fk.targetEntity}
                                        >
                                            {`${fk.field} (FK)`}
                                        </Typography>
                                    </Box>
                                ))}
                            </>
                        ) : (
                            <>
                                {indexFields
                                    .filter((field) => field.name !== "seq")
                                    .map((field) => (
                                        <Typography
                                            key={`${entityName}:idx:${field.name}`}
                                            variant="body2"
                                        >
                                            {field.isUnique
                                                ? `${field.name} (UK)`
                                                : field.name}
                                        </Typography>
                                    ))}
                            </>
                        )}
                    </Stack>
                </Box>
            </StyledPaper>
        );
    },
);

ErdEntityCard.displayName = "ErdEntityCard";
