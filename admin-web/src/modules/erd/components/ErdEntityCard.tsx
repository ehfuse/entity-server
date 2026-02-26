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
    maxWidth: 240,
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
                        <Typography variant="body2" data-seq-field="true">
                            seq (PK)
                        </Typography>
                        {fkFields.length > 0 ? (
                            <>
                                {fkFields.map((fk) => (
                                    <Typography
                                        key={`${entityName}:${fk.field}`}
                                        variant="body2"
                                        data-fk-field={fk.field}
                                        data-fk-target={fk.targetEntity}
                                    >
                                        {`${fk.field} (FK)`}
                                    </Typography>
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
