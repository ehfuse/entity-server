export interface ERDColumn {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
}

export interface ERDTableMeta {
    name: string;
    columns?: ERDColumn[];
}

export interface ERDEntityMeta {
    name: string;
    description?: string;
    db_group?: string;
    fields: string[];
    unique_fields?: string[];
    tables: {
        data: ERDTableMeta;
        index: ERDTableMeta;
        history: ERDTableMeta;
    };
}

export interface ERDSchemaResponse {
    entities: ERDEntityMeta[];
}
