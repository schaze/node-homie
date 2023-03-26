export type Primitive = string | number | boolean | symbol;
export function isPrimitive(input: any): input is Primitive {
    return typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number' || typeof input === 'symbol';
}

export type RXObjectAttributes = {
    [attributeName: string]: Primitive | Primitive[] | undefined;
}

export type ToRXObjectAttributes<T> = {
    [Property in keyof T]: T[Property] extends Primitive | Primitive[] | undefined ? T[Property] : never;
}