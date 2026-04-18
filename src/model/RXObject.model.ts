export type Primitive = string | number | boolean;
export function isPrimitive(input: any): input is Primitive {
    return typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number';
}

export type RXObjectAttributes = {
    [attributeName: string]: Primitive | Primitive[] | null | undefined;
}

export type ToRXObjectAttributes<T> = {
    [Property in keyof T]: T[Property] extends Primitive | Primitive[] | null | undefined ? T[Property] : never;
}