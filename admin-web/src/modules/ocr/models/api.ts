// modules/ocr/models/api.ts — OCR API 호출 함수
import { admin } from "../../../api/entityServerClient";
import type {
    OcrRecognizeOptions,
    OcrRecognizeResponse,
    OcrResultItem,
    OcrQuotaInfo,
} from "./types/ocr";

export const ocrApi = {
    /** OCR 인식 요청 (multipart/form-data) */
    recognize: async (
        file: File,
        options: OcrRecognizeOptions,
    ): Promise<OcrRecognizeResponse> => {
        const formData = new FormData();
        formData.append("file", file);
        if (options.doc_type && options.doc_type !== "general") {
            formData.append("doc_type", options.doc_type);
        }
        if (options.languages?.length) {
            formData.append("languages", options.languages.join(","));
        }
        if (options.provider) {
            formData.append("provider", options.provider);
        }
        if (options.include_boxes) {
            formData.append("include_boxes", "true");
        }
        if (options.page_range) {
            formData.append("page_range", options.page_range);
        }
        return admin.post<OcrRecognizeResponse>("/v1/ocr/recognize", formData);
    },

    /** 결과 목록 조회 */
    listResults: (params?: {
        doc_type?: string;
        page?: number;
        page_size?: number;
    }) =>
        admin.get<{ items: OcrResultItem[]; total: number }>(
            "/v1/ocr/results",
            params,
        ),

    /** 결과 상세 조회 */
    getResult: (id: string) =>
        admin.get<OcrRecognizeResponse>(`/v1/ocr/results/${id}`),

    /** 결과 삭제 */
    deleteResult: (id: string) =>
        admin.delete<{ ok: boolean }>(`/v1/ocr/results/${id}`),

    /** 쿼터 조회 */
    getQuota: () => admin.get<OcrQuotaInfo>("/v1/ocr/quota"),
};
