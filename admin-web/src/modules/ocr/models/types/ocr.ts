// modules/ocr/models/types/ocr.ts — OCR 페이지 전용 UI 타입

export type DocType =
    | "general"
    | "business_reg"
    | "receipt"
    | "invoice"
    | "namecard"
    | "id_card"
    | "driver_license"
    | "facility_card"
    | "career_cert";

export interface DocTypeOption {
    value: DocType;
    label: string;
    description: string;
}

export interface OcrRecognizeOptions {
    doc_type: DocType;
    languages?: string[];
    provider?: string;
    include_boxes?: boolean;
    page_range?: string;
}

export interface OcrPageResult {
    page_num: number;
    width: number;
    height: number;
    text: string;
    confidence: number;
}

export interface OcrParsedResult {
    doc_type: string;
    parse_method: "template" | "llm" | "none";
    [key: string]: unknown;
}

export interface OcrRecognizeResponse {
    success: boolean;
    id: string;
    text: string;
    pages: OcrPageResult[];
    parsed?: OcrParsedResult;
    confidence: number;
    processing_ms: number;
    provider: string;
}

export interface OcrResultItem {
    id: string;
    doc_type: string;
    state: "completed" | "pending" | "failed";
    confidence: number;
    processing_ms: number;
    provider: string;
    created_at: string;
}

export interface OcrQuotaInfo {
    used: number;
    limit: number;
    reset_at: string;
}
