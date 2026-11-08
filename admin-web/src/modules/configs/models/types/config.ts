export interface ConfigDomain {
    domain: string;
    label: string;
    config: Record<string, unknown>;
    exists: boolean;
}

export interface ConfigsResponse {
    items: ConfigDomain[];
    total: number;
}

export interface ConfigUpdateResponse {
    domain: string;
    label: string;
    config: Record<string, unknown>;
}
