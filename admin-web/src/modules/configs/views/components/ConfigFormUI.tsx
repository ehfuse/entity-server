/**
 * 설정 페이지 공용 UI 컴포넌트
 *
 * FieldGroup  : Paper 기반 섹션 컨테이너 (제목 + 선택적 서브타이틀)
 * FieldRow    : 라벨(왼쪽) + 폼 컨트롤(오른쪽) 한 줄 레이아웃
 * SectionTitle: FieldGroup 밖에서 단독으로 쓰는 섹션 제목
 *
 * 사용 예)
 *   <FieldGroup title="기본 정보" subtitle="서버 식별에 사용됩니다">
 *     <FieldRow label="namespace" description="서비스 네임스페이스">
 *       <TextField ... />
 *     </FieldRow>
 *     <FieldRow label="prefork">
 *       <Switch ... />
 *     </FieldRow>
 *   </FieldGroup>
 *
 *   // 그룹 없이 단독 사용
 *   <FieldRow label="level">
 *     <Select ... />
 *   </FieldRow>
 */

import { Box, Paper, Tooltip, Typography } from "@mui/material";

// ─────────────────────────────────────────────
// FieldGroup
// ─────────────────────────────────────────────

interface FieldGroupProps {
    /** 섹션 제목 */
    title: string;
    /** 섹션 서브타이틀 (선택) */
    subtitle?: string;
    children: React.ReactNode;
}

export const FieldGroup = ({ title, subtitle, children }: FieldGroupProps) => (
    <Box>
        <Box sx={{ mb: 1 }}>
            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, color: "#1e293b" }}
            >
                {title}
            </Typography>
            {subtitle && (
                <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    {subtitle}
                </Typography>
            )}
        </Box>
        <Paper variant="outlined" sx={{ borderRadius: 2, px: 2, py: 1 }}>
            {children}
        </Paper>
    </Box>
);

// ─────────────────────────────────────────────
// FieldRow
// ─────────────────────────────────────────────

interface FieldRowProps {
    /** 왼쪽에 표시할 키/라벨 */
    label: string;
    /** hover 시 보여줄 툴팁 설명 */
    description?: string;
    /** 라벨 열 최소 너비 (기본 180px) */
    labelWidth?: number;
    children: React.ReactNode;
}

export const FieldRow = ({
    label,
    description,
    labelWidth = 180,
    children,
}: FieldRowProps) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 0.75 }}>
        <Box sx={{ minWidth: labelWidth, flexShrink: 0 }}>
            <Tooltip
                title={description ?? ""}
                placement="right"
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
                    {label}
                </Typography>
            </Tooltip>
        </Box>
        {children}
    </Box>
);

// ─────────────────────────────────────────────
// SectionTitle  (FieldGroup 없이 단독 사용)
// ─────────────────────────────────────────────

interface SectionTitleProps {
    title: string;
    subtitle?: string;
}

export const SectionTitle = ({ title, subtitle }: SectionTitleProps) => (
    <Box sx={{ mb: 1.5 }}>
        <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: "#1e293b" }}
        >
            {title}
        </Typography>
        {subtitle && (
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                {subtitle}
            </Typography>
        )}
    </Box>
);
