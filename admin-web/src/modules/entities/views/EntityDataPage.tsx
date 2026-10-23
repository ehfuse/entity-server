import { useState } from "react";
import { useParams } from "react-router-dom";
import {
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Pagination,
    CircularProgress,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import {
    useQuery,
    useMutation,
    useQueryClient,
    keepPreviousData,
} from "@tanstack/react-query";
import { entitiesApi } from "../models/api";
import { formatDate, formatDateTime } from "../../shared/utils/dateTime";
import EntityDataDialog from "./dialogs/DataDialog";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import DataInsertDialog from "./dialogs/InsertDialog";
import type { EntityField } from "../models/types/entity";

/** EntityField 배열로부터 삽입 템플릿 객체를 생성합니다 */
const buildInsertTemplate = (fields: EntityField[]): Record<string, unknown> =>
    Object.fromEntries(
        fields
            .filter(
                (f) =>
                    f.name !== "seq" &&
                    f.name !== "id" &&
                    f.name !== "created_time" &&
                    f.name !== "updated_time" &&
                    f.name !== "deleted_time",
            )
            .map((f) => [f.name, f.default !== undefined ? f.default : null]),
    );

const PRIORITY_COLUMNS = [
    "seq",
    "name",
    "abbr",
    "secret_key",
    "created_time",
    "updated_time",
];

const COLUMN_ALIASES: Record<string, string[]> = {
    abbr: ["abbr", "name_abbr"],
};

const DATETIME_COLUMNS = [
    "created_time",
    "updated_time",
    "created_at",
    "updated_at",
];

const EntityDataPage = () => {
    const { entityName } = useParams<{ entityName: string }>();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [rowsPerPage] = useState(20);
    const [selectedRecord, setSelectedRecord] = useState<Record<
        string,
        unknown
    > | null>(null);
    const [entityDialogOpen, setEntityDialogOpen] = useState(false);
    const [dataDialogOpen, setDataDialogOpen] = useState(false);

    const { data: entityMeta } = useQuery({
        queryKey: ["entityMeta", entityName],
        queryFn: () => entitiesApi.getEntity(entityName!),
        enabled: !!entityName,
    });

    const insertTemplate =
        entityMeta?.data?.fields && entityMeta.data.fields.length > 0
            ? buildInsertTemplate(entityMeta.data.fields)
            : null;

    const { data, isLoading } = useQuery({
        queryKey: ["entityData", entityName, page, rowsPerPage],
        queryFn: () =>
            entitiesApi.getEntityData(entityName!, page, rowsPerPage),
        enabled: !!entityName,
        placeholderData: keepPreviousData,
    });

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) =>
            entitiesApi.createEntityData(entityName!, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["entityData", entityName],
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({
            seq,
            payload,
        }: {
            seq: string;
            payload: Record<string, unknown>;
        }) => entitiesApi.updateEntityData(entityName!, seq, payload),
        onSuccess: (_, { seq, payload }) => {
            queryClient.setQueryData(
                ["entityData", entityName, page, rowsPerPage],
                (
                    old:
                        | { items: Record<string, unknown>[]; total: number }
                        | undefined,
                ) => {
                    if (!old) return old;
                    return {
                        ...old,
                        items: old.items.map((item) =>
                            String(item.seq ?? item.id) === seq
                                ? { ...item, ...payload }
                                : item,
                        ),
                    };
                },
            );
        },
    });

    const handleChangePage = (
        _: React.ChangeEvent<unknown>,
        newPage: number,
    ) => {
        setPage(newPage);
    };

    const handleRowClick = (record: Record<string, unknown>) => {
        setSelectedRecord(record);
        setEntityDialogOpen(true);
    };

    const handleCreateData = async (payload: Record<string, unknown>) => {
        await createMutation.mutateAsync(payload);
    };

    const handleSaveRecord = async (updated: Record<string, unknown>) => {
        const seq = String(selectedRecord?.seq ?? selectedRecord?.id ?? "");
        await updateMutation.mutateAsync({ seq, payload: updated });
    };

    // 동적 컬럼 생성 + 우선 순서 정렬
    const rawColumns = (data?.items || []).reduce<string[]>((acc, record) => {
        Object.keys(record).forEach((column) => {
            if (!acc.includes(column)) {
                acc.push(column);
            }
        });
        return acc;
    }, []);

    const selectedPriorityColumns = PRIORITY_COLUMNS.filter((column) => {
        const candidates = COLUMN_ALIASES[column] || [column];
        return candidates.some((candidate) => rawColumns.includes(candidate));
    });

    const selectedAliasColumns = new Set(
        selectedPriorityColumns.flatMap(
            (column) => COLUMN_ALIASES[column] || [column],
        ),
    );

    const columns = [
        ...selectedPriorityColumns,
        ...rawColumns.filter((column) => !selectedAliasColumns.has(column)),
    ];

    const getColumnValue = (
        record: Record<string, unknown>,
        column: string,
    ) => {
        const candidates = COLUMN_ALIASES[column] || [column];
        const matchedColumn = candidates.find((candidate) =>
            Object.prototype.hasOwnProperty.call(record, candidate),
        );

        if (!matchedColumn) {
            return undefined;
        }

        return record[matchedColumn];
    };

    const formatCellValue = (column: string, value: unknown) => {
        if (value === null || value === undefined) {
            return "";
        }

        if (column.endsWith("_date") && typeof value === "string") {
            return formatDate(value);
        }

        if (DATETIME_COLUMNS.includes(column) && typeof value === "string") {
            return formatDateTime(value);
        }

        return String(value);
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Paper
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    maxHeight: "100%",
                    overflow: "hidden",
                }}
            >
                <OverlayScrollbar style={{ flex: 1, minHeight: 0 }}>
                    <TableContainer sx={{ overflow: "visible" }}>
                        <Table stickyHeader>
                            <TableHead>
                                <TableRow>
                                    {columns.map((col) => (
                                        <TableCell key={col}>
                                            <strong>{col}</strong>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            align="center"
                                        >
                                            <CircularProgress />
                                        </TableCell>
                                    </TableRow>
                                ) : data?.items?.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            align="center"
                                            sx={{ py: 10 }}
                                        >
                                            데이터가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data?.items?.map(
                                        (
                                            record: Record<string, unknown>,
                                            index: number,
                                        ) => (
                                            <TableRow
                                                key={index}
                                                hover
                                                onClick={() =>
                                                    handleRowClick(record)
                                                }
                                                sx={{ cursor: "pointer" }}
                                            >
                                                {columns.map((col) => (
                                                    <TableCell key={col}>
                                                        {formatCellValue(
                                                            col,
                                                            getColumnValue(
                                                                record,
                                                                col,
                                                            ),
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ),
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </OverlayScrollbar>
                <Box
                    sx={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 2,
                        "&::before": {
                            content: '""',
                            position: "absolute",
                            top: -1,
                            left: 0,
                            right: 0,
                            height: "1px",
                            backgroundColor: "#e0e0e0",
                        },
                    }}
                >
                    <Box sx={{ width: 200 }}>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={<AddIcon />}
                            onClick={() => setDataDialogOpen(true)}
                        >
                            추가
                        </Button>
                    </Box>
                    <Pagination
                        count={Math.ceil((data?.total || 0) / rowsPerPage)}
                        page={page}
                        size="large"
                        onChange={handleChangePage}
                        showFirstButton
                        showLastButton
                    />
                    <Box sx={{ width: 200 }} />
                </Box>
            </Paper>

            <EntityDataDialog
                open={entityDialogOpen}
                onClose={() => setEntityDialogOpen(false)}
                entityName={entityName || "entity"}
                record={selectedRecord}
                onSave={handleSaveRecord}
            />

            <DataInsertDialog
                open={dataDialogOpen}
                onClose={() => setDataDialogOpen(false)}
                entityName={entityName || "entity"}
                initialData={insertTemplate}
                onSubmit={handleCreateData}
            />
        </Box>
    );
};

export default EntityDataPage;
