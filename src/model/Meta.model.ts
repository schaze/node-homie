import { HomieID } from "./Base.model";

export interface MetaKeyAttributes {
    id: HomieID;
    key?: string;
    value?: string;
    subkeys?: MetaSubkeyAttributes[]
}


export interface MetaSubkeyAttributes {
    id: HomieID;
    key?: string;
    value?: string;
}

export type MetaAttributes = MetaKeyAttributes[];
