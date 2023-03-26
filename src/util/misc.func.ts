import { HomieID, ObjectMap } from "../model/Base.model";

export async function asyncTimeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomHomieId(): HomieID {
    return (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2).toLowerCase();
}

export function stringToBool(val: string | undefined | null): boolean {
    return val === 'true';
}

export function mapObject<T, U, KEY extends string>(map: ObjectMap<KEY, T>, predicate: (id: HomieID, data: T) => U): ObjectMap<KEY, U> {
    const result = <ObjectMap<KEY, U>>{};
    for (const id in map) {
        if (Object.prototype.hasOwnProperty.call(map, id)) {
            const data = map[id];
            result[id] = predicate(id, data);
        }
    }
    return result;
}


export function arraysAreEqual<T>(a?: T[], b?: T[]): boolean {
    // console.log("a:", a, "b:", b);
    if (!a && !b) { return true; }
    if (((!a && b) || (a && !b))) {
        // console.log("not equal");
        return false;
    } else if (a && b) {
        if (a.length !== b.length) { return false }
        for (let index = 0; index < a.length; index++) {
            const elementA = a[index];
            if (!b.includes(elementA)) {
                // console.log("not equal");
                return false;
            }
        }
    }
    // console.log("equal");
    return true;
}

export function isObjectEmpty(object: Record<string, unknown>): boolean {
    for (const property in object) {
      return false;
    }
    return true;
  }