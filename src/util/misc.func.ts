import { HomieID } from "../model/Base.model";


export function randomHomieId(): HomieID{
    return (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2).toLowerCase();
}

export function stringToBool(val: string | undefined | null): boolean {
    return val==='true';
}
