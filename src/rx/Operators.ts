import { combineLatest, Observable, of, OperatorFunction } from "rxjs";
import { distinctUntilChanged, filter, map, mapTo, switchMap } from "rxjs/operators";
import { notNull, notNullish, notUndefined } from "../model";

export function isNotNullish<T>() {
    return (source$: Observable<null | undefined | T>) => source$.pipe(filter(notNullish));
}

export function isNotNull<T>() {
    return (source$: Observable<null | undefined | T>) => source$.pipe(filter(notNull));
}

export function isNotUndefined<T>() {
    return (source$: Observable<null | undefined | T>) => source$.pipe(filter(notUndefined));
}

export function watchList<T, R>(select: (item: T) => Observable<R>): OperatorFunction<T[], T[]> {
    return (source: Observable<T[]>): Observable<T[]> => {
        return source.pipe(
            switchMap((items) =>
                !items || items.length === 0
                    ? of<T[]>([])
                    : combineLatest(items.map((item) => select(item).pipe(mapTo(item)))),
            ),
        );
    };
}

export function mergeWatchList<T, S>(predicate: (item: T) => Observable<S[]>): OperatorFunction<T[], S[]> {
    return (source: Observable<T[]>): Observable<S[]> =>
        source.pipe(
            switchMap((list) =>
                !list || list.length === 0
                    ? of<S[]>([])
                    : combineLatest(list.map((item) => predicate(item))).pipe(map((listOfLists) => listOfLists.flat())),
            ),
        );
}

export function mergeWatchIndex<T, S>(
    predicate: (item: T) => Observable<{ [pointer: string]: S }>,
): OperatorFunction<T[], { [pointer: string]: S }> {
    return (source: Observable<T[]>): Observable<{ [pointer: string]: S }> =>
        source.pipe(
            switchMap((list) =>
                !list || list.length === 0
                    ? of<{ [pointer: string]: S }>({})
                    : combineLatest(list.map((item) => predicate(item))).pipe(
                          map((indexList) => mergeIndex(indexList)),
                      ),
            ),
        );
}

export function toIndex<T>(getIndex: (item: T) => string): OperatorFunction<T[], { [pointer: string]: T }> {
    return (source: Observable<T[]>): Observable<{ [pointer: string]: T }> =>
        source.pipe(map((items) => makeIndex(items, getIndex)));
}

export function makeIndex<T>(itemList: T[], getIndex: (item: T) => string): { [pointer: string]: T } {
    const propsIndexed: { [pointer: string]: T } = {};
    for (let index = 0; index < itemList.length; index++) {
        const item = itemList[index];
        propsIndexed[getIndex(item)] = item;
    }
    return propsIndexed;
}

export function mergeIndex<T>(indexes: { [pointer: string]: T }[]): { [pointer: string]: T } {
    var newIndex: { [pointer: string]: T } = {};
    for (let index = 0; index < indexes.length; index++) {
        const nodeIndex = indexes[index];
        newIndex = { ...newIndex, ...nodeIndex };
    }
    return newIndex;
}

export function mandatoryPluckSwitchMap<T, R, K extends keyof T>(
    attr: K,
    project: (v: T[K]) => Observable<R> | null | undefined,
    distinct = true,
): OperatorFunction<T, R> {
    return (source: Observable<T>): Observable<R> => {
        // pluck <attr> from object, only emit if changed and switch subscription to projected observable
        // logic is, that if our mandatory pluck emits a value we found our target and stop listening to the source observable
        const resObs = source.pipe(mandatoryPluck(attr), distinctUntilChanged(), mandatorySwitchMap(project));
        return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
    };
}

export function optionalPluckSwitchMap<T, R, K extends keyof T>(
    attr: K,
    project: (v: T[K] | null | undefined) => Observable<R> | null | undefined,
    distinct = true,
): OperatorFunction<T | undefined, R | undefined> {
    return (source: Observable<T | undefined>): Observable<R | undefined> => {
        // pluck <attr> from source object emissions and only emit if changed
        // when the result is here switch subscription to projected observable
        const resObs = source.pipe(optionalPluck(attr), distinctUntilChanged(), optionalSwitchMap(project));
        return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
    };
}

export function mandatorySwitchMap<T, R>(project: (v: T) => Observable<R> | null | undefined): OperatorFunction<T, R> {
    return (source: Observable<T>): Observable<R> => {
        return source.pipe(
            switchMap((v) => project(v) ?? of(undefined)),
            mandatory(),
        );
    };
}

export function optionalSwitchMap<T, R>(
    project: (v: T | null | undefined) => Observable<R> | null | undefined,
): OperatorFunction<T | undefined, R | undefined> {
    return (source: Observable<T | undefined>): Observable<R | undefined> => {
        return source.pipe(
            switchMap((v) => {
                const projRes = project(v);
                return projRes !== undefined && projRes !== null ? projRes : of(undefined);
            }),
        );
    };
}

export function mandatoryPluck<T, K extends keyof T>(attr: K): OperatorFunction<T, T[K]> {
    return (source: Observable<T>): Observable<T[K]> => {
        return source.pipe(
            map((attrs) => attrs[attr]),
            mandatory(),
        );
    };
}

export function optionalPluck<T, K extends keyof T>(attr: K): OperatorFunction<T | undefined, T[K] | undefined> {
    return (source: Observable<T | undefined>): Observable<T[K] | undefined> => {
        return source.pipe(map((v) => (v ? v[attr] : undefined)));
    };
}

export function mandatory<T, R extends T>(): OperatorFunction<T | null | undefined, R> {
    return (source: Observable<T | null | undefined>): Observable<R> => {
        return source.pipe(filter((v) => v !== null && v !== undefined)) as Observable<R>;
    };
}

export function flattenAndRemoveNullish<T, R extends NonNullable<T>>(): OperatorFunction<T[][], R[]> {
    return (source: Observable<T[][]>): Observable<R[]> => {
        return source.pipe(
            map((objs) => {
                const filtered = [];
                for (let index = 0; index < objs.length; index++) {
                    const dataSet = objs[index];
                    for (let indexSet = 0; indexSet < dataSet.length; indexSet++) {
                        const obj = dataSet[indexSet];
                        if (obj !== null && obj !== undefined) {
                            filtered.push(obj);
                        }
                    }
                }
                return filtered;
            }),
        ) as Observable<R[]>;
    };
}

export function removeNullish<T, R extends NonNullable<T>>(): OperatorFunction<T[], R[]> {
    return (source: Observable<T[]>): Observable<R[]> => {
        return source.pipe(
            map((objs) => {
                const filtered = [];
                for (let index = 0; index < objs.length; index++) {
                    const node = objs[index];
                    if (node) {
                        filtered.push(node);
                    }
                }
                return filtered;
            }),
        ) as Observable<R[]>;
    };
}

