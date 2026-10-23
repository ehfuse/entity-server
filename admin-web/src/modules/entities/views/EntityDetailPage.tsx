import { useParams } from "react-router-dom";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Chip,
    CircularProgress,
    Paper,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { entitiesApi } from "../models/api";
import { formatDateTime } from "../../shared/utils/dateTime";

const EntityDetailPage = () => {
    const { entityName } = useParams<{ entityName: string }>();

    const { data, isLoading } = useQuery({
        queryKey: ["entity", entityName],
        queryFn: () => entitiesApi.getEntity(entityName!),
        enabled: !!entityName,
    });

    if (isLoading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    const entity = data?.data;

    if (!entity) {
        return <Typography>엔티티를 찾을 수 없습니다.</Typography>;
    }

    return (
        <Box>
            <Typography variant="h4" gutterBottom>
                엔티티 상세: {entity.name}
            </Typography>

            <Card sx={{ mt: 2 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        기본 정보
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(2, 1fr)",
                            },
                            gap: 2,
                        }}
                    >
                        <Box>
                            <Typography color="textSecondary">이름</Typography>
                            <Typography variant="body1">
                                {entity.name}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography color="textSecondary">설명</Typography>
                            <Typography variant="body1">
                                {entity.description || "-"}
                            </Typography>
                        </Box>
                        <Box>
                            <Typography color="textSecondary">
                                생성일
                            </Typography>
                            <Typography variant="body1">
                                {formatDateTime(entity.created_time)}
                            </Typography>
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            <Card sx={{ mt: 2 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        필드
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {entity.fields?.map((field, index) => (
                            <Paper
                                key={index}
                                sx={{ p: 1, display: "inline-flex", gap: 0.5 }}
                            >
                                <Chip
                                    label={field.name}
                                    color="primary"
                                    size="small"
                                />
                                <Chip label={field.type} size="small" />
                                {field.required && (
                                    <Chip
                                        label="필수"
                                        color="error"
                                        size="small"
                                    />
                                )}
                                {field.unique && (
                                    <Chip
                                        label="유일"
                                        color="success"
                                        size="small"
                                    />
                                )}
                            </Paper>
                        ))}
                    </Box>
                </CardContent>
            </Card>

            {entity.hooks && entity.hooks.length > 0 && (
                <Card sx={{ mt: 2 }}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            훅
                        </Typography>
                        {entity.hooks.map((hook, index) => (
                            <Box key={index} sx={{ mb: 2 }}>
                                <Chip
                                    label={hook.type}
                                    color="secondary"
                                    sx={{ mb: 1 }}
                                />
                                <Paper sx={{ p: 2, bgcolor: "grey.100" }}>
                                    <pre
                                        style={{ margin: 0, overflow: "auto" }}
                                    >
                                        {hook.script}
                                    </pre>
                                </Paper>
                            </Box>
                        ))}
                    </CardContent>
                </Card>
            )}
        </Box>
    );
};

export default EntityDetailPage;
