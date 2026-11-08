export interface Account {
    seq: number;
    name: string;
    email: string;
    rbac_role?: string;
    entity_role?: string;
    license_seq?: number;
}
