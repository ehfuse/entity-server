export interface RbacRole {
    seq: number;
    name: string;
    description?: string;
    permissions: string | string[]; // DB: JSON 문자열, 파싱 후 배열
    created_time?: string;
    updated_time?: string;
    deleted_time?: string | null;
}
