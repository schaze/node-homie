import { HomieDatatype, HomieValuesTypes } from "../model";

export function str2Hm(value: string | undefined | null, datatype: HomieDatatype | undefined | null): HomieValuesTypes {
    return hm2Type(value, datatype);
}
export function hm2Type(value: string | undefined | null, datatype: HomieDatatype | undefined | null): HomieValuesTypes {
    try {
        switch (datatype) {
            case 'boolean':
                return value === 'true';
            case 'integer':
                return value ? parseInt(value, 10) : 0;
            case 'float':
                return value ? parseFloat(value) : 0;
            case 'datetime':
                return value ? new Date(value) : new Date(0);
            default:
                return value;
        }
    } catch (err) {
        return value;
    }
}


export function hm2Str(value: HomieValuesTypes, datatype: HomieDatatype): string {
    return type2Hm(value, datatype);
}
export function type2Hm(value: HomieValuesTypes, datatype: HomieDatatype): string {
    if (value === null || value === undefined) { return String(null); }
    try {
        switch (datatype) {
            case 'boolean':
                return String(value);
            case 'integer':
                return (value as number).toFixed(0)
            case 'float':
                return String(value);
            case 'datetime':
                return (value as Date).toISOString();
            default:
                return String(value);
        }
    } catch (err) {
        return String(value);
    }
}