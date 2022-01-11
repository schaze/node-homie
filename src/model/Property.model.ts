import { BaseItemAtrributes, HomieDatatype } from "./Base.model";

export interface HomiePropertyAtrributes extends BaseItemAtrributes {
    datatype?: HomieDatatype;
    format?: string;
    settable?: boolean;
    retained?: boolean;
    unit?: string;
}

export interface HomiePropertyOptions {
    readValueFromMqtt: boolean;
    readTimeout?: number;
}