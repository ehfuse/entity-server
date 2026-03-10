// modules/ocr/controllers/ocrController.ts
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ocrApi } from "../models/api";
import type {
    DocType,
    OcrRecognizeOptions,
    OcrRecognizeResponse,
} from "../models/types/ocr";

export const DOC_TYPE_OPTIONS: {
    value: DocType;
    label: string;
    description: string;
}[] = [
    {
        value: "general",
        label: "일반 텍스트",
        description: "문서 종류 무관 텍스트 추출",
    },
    {
        value: "business_reg",
        label: "사업자등록증",
        description: "사업자번호, 법인명, 대표자 등",
    },
    {
        value: "receipt",
        label: "영수증",
        description: "매장명, 금액, 결제수단 등",
    },
    {
        value: "invoice",
        label: "세금계산서",
        description: "공급자, 공급받는자, 품목, 세액 등",
    },
    {
        value: "namecard",
        label: "명함",
        description: "이름, 직함, 회사, 연락처 등",
    },
    {
        value: "id_card",
        label: "신분증",
        description: "이름, 주민번호, 주소 등",
    },
    {
        value: "driver_license",
        label: "운전면허증",
        description: "이름, 면허번호, 유효기간 등",
    },
    {
        value: "facility_card",
        label: "시설물대장",
        description: "시설명, 위치, 관리번호 등",
    },
    {
        value: "career_cert",
        label: "경력증명서",
        description: "이름, 근무처, 기간, 직급 등",
    },
];

export const useOcrController = () => {
    const queryClient = useQueryClient();

    const [docType, setDocType] = useState<DocType>("general");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [includeBoxes, setIncludeBoxes] = useState(false);
    const [result, setResult] = useState<OcrRecognizeResponse | null>(null);

    const handleFileSelect = useCallback((file: File | null) => {
        setSelectedFile(file);
        setResult(null);
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    }, []);

    const recognizeMutation = useMutation({
        mutationFn: async ({
            file,
            options,
        }: {
            file: File;
            options: OcrRecognizeOptions;
        }) => ocrApi.recognize(file, options),
        onSuccess: (data) => {
            setResult(data);
            queryClient.invalidateQueries({ queryKey: ["ocr-results"] });
        },
    });

    const runRecognize = useCallback(() => {
        if (!selectedFile) return;
        recognizeMutation.mutate({
            file: selectedFile,
            options: {
                doc_type: docType,
                include_boxes: includeBoxes,
            },
        });
    }, [selectedFile, docType, includeBoxes, recognizeMutation]);

    const historyQuery = useQuery({
        queryKey: ["ocr-results", docType],
        queryFn: () =>
            ocrApi.listResults({
                doc_type: docType !== "general" ? docType : undefined,
                page_size: 20,
            }),
    });

    const quotaQuery = useQuery({
        queryKey: ["ocr-quota"],
        queryFn: () => ocrApi.getQuota(),
    });

    return {
        docType,
        setDocType,
        selectedFile,
        previewUrl,
        handleFileSelect,
        includeBoxes,
        setIncludeBoxes,
        result,
        runRecognize,
        recognizeLoading: recognizeMutation.isPending,
        recognizeError: recognizeMutation.error?.message ?? null,
        history: historyQuery.data?.items ?? [],
        historyTotal: historyQuery.data?.total ?? 0,
        historyLoading: historyQuery.isLoading,
        quota: quotaQuery.data ?? null,
    };
};
