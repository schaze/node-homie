

export function notNull<T>(input: null | undefined | T): input is T | undefined {
    return input !== null;
}

export function notUndefined<T>(input: null | undefined | T): input is T | null{
    return input !== undefined;
}

export function notNullish<T>(input: null | undefined | T): input is T {
    return notNull(input) && notUndefined(input);
}