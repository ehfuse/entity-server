import {
    Box,
    Card,
    CardContent,
    Divider,
    Skeleton,
    Stack,
    Typography,
} from "@mui/material";

// ─────────────────────────────────────────────
// StatCard  – 숫자 통계 카드
// ─────────────────────────────────────────────

export const StatCard = ({
    title,
    value,
    sub,
    icon,
    loading,
    onClick,
}: {
    title: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    loading?: boolean;
    onClick?: () => void;
}) => (
    <Card
        sx={{
            height: "100%",
            ...(onClick && {
                cursor: "pointer",
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 4 },
            }),
        }}
        onClick={onClick}
    >
        <CardContent>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                }}
            >
                <Box>
                    <Typography
                        color="textSecondary"
                        gutterBottom
                        variant="body2"
                    >
                        {title}
                    </Typography>
                    {loading ? (
                        <Skeleton variant="text" width={80} height={48} />
                    ) : (
                        <Typography
                            variant="h4"
                            component="div"
                            sx={{ fontWeight: 700 }}
                        >
                            {value}
                        </Typography>
                    )}
                    {sub && !loading && (
                        <Typography variant="caption" color="text.secondary">
                            {sub}
                        </Typography>
                    )}
                </Box>
                <Box sx={{ color: "primary.main", fontSize: 40, opacity: 0.7 }}>
                    {icon}
                </Box>
            </Box>
        </CardContent>
    </Card>
);

// ─────────────────────────────────────────────
// InfoCard  – 아이콘 + 제목 + 행 목록 카드
// ─────────────────────────────────────────────

export const InfoCard = ({
    title,
    icon,
    loading,
    onClick,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    loading?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}) => (
    <Card
        sx={{
            height: "100%",
            ...(onClick && {
                cursor: "pointer",
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 4 },
            }),
        }}
        onClick={onClick}
    >
        <CardContent>
            <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
            >
                <Box
                    sx={{
                        color: "primary.main",
                        fontSize: 22,
                        display: "flex",
                    }}
                >
                    {icon}
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {title}
                </Typography>
            </Box>
            {loading ? (
                <Stack gap={0.5}>
                    <Skeleton variant="text" />
                    <Skeleton variant="text" />
                    <Skeleton variant="text" />
                </Stack>
            ) : (
                children
            )}
        </CardContent>
    </Card>
);

// ─────────────────────────────────────────────
// InfoRow  – InfoCard 내부 레이블-값 행
// ─────────────────────────────────────────────

export const InfoRow = ({
    label,
    children,
    first,
}: {
    label: string;
    children: React.ReactNode;
    /** 첫 번째 행이면 Divider를 생략 */
    first?: boolean;
}) => (
    <>
        {!first && <Divider />}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.6 }}>
            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: 120, flexShrink: 0 }}
            >
                {label}
            </Typography>
            {children}
        </Box>
    </>
);

// ─────────────────────────────────────────────
// InfoText  – InfoRow 오른쪽 텍스트 값
// ─────────────────────────────────────────────

export const InfoText = ({
    value,
    mono,
}: {
    value: string | number;
    mono?: boolean;
}) => (
    <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontFamily: mono ? "D2Coding" : undefined }}
    >
        {value}
    </Typography>
);
