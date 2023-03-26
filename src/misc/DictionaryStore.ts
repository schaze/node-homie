import { BehaviorSubject, Observable, Subject } from "rxjs";
import { filter, map, shareReplay } from "rxjs/operators";
import { OnDestroy } from "./Lifecycle";
import { ObjectMap } from "../model";

export interface DictionaryStoreEventBase<NAME extends 'add' | 'remove' | 'update'> {
    name: NAME;
}
export interface DictionaryStoreEventAdd<T> extends DictionaryStoreEventBase<'add'> {
    item: T;
}
export interface DictionaryStoreEventUpdate<T> extends DictionaryStoreEventBase<'update'> {
    item: T;
}
export interface DictionaryStoreEventRemove<T> extends DictionaryStoreEventBase<'remove'> {
    item: T;
}

export type DictionaryStoreEvent<T> = DictionaryStoreEventAdd<T> | DictionaryStoreEventUpdate<T> | DictionaryStoreEventRemove<T>;

export class DictionaryStore<T> implements OnDestroy {
    protected onDestroy$ = new Subject<boolean>();

    protected _state$ = new BehaviorSubject<ObjectMap<string, T>>({});

    public state$ = this._state$.asObservable();
    public get state(): ObjectMap<string, T> {
        return this._state$.getValue();
    }

    // public asArray$ = 
    protected _asArray: Observable<T[]> | null = null;
    public get asArray$() {
        if (!this._asArray) {
            this._asArray = this.state$.pipe(map(state => Object.values(state)), shareReplay(1));
        }
        return this._asArray;
    }

    protected _events$ = new Subject<DictionaryStoreEvent<T>>();
    public events$ = this._events$.asObservable();

    constructor(public getId: (item: T) => string) {
    }

    public add(item: T): T {
        return this.addOrUpdate(item);
    }

    public addOrUpdate(item: T): T {
        const id = this.getId(item);
        if (Object.prototype.hasOwnProperty.call(this.state, id)) {
            this.updateState({ ...this.state, [id]: item });
            this.sendEvent({ name: 'update', item: item });
        } else {
            this.updateState({ ...this.state, [id]: item });
            this.sendEvent({ name: 'add', item: item });
        }
        return item;
    }

    public addOrUpdateMany(items: ObjectMap<string, T>): ObjectMap<string, T> {
        const events = <DictionaryStoreEvent<T>[]>[];
        const ids = Object.keys(items);
        for (let index = 0; index < ids.length; index++) {
            const id = ids[index];
            const item = items[id];
            events.push(this.hasId(id) ? { name: 'update', item: item } : { name: 'add', item: item });
        }

        this.updateState({ ...this.state, ...items });
        events.forEach(event => this.sendEvent(event));

        return items;
    }


    public remove(id: string): T | undefined {
        const { [id]: removedItem, ...rest } = this.state;
        if (removedItem) {
            this.updateState(rest)
            this.sendEvent({ name: 'remove', item: removedItem });
        }
        return removedItem;
    }

    public removeMany(ids: string[]) {
        const stateCopy = { ...this.state };
        const removedItems = <T[]>[];
        const events = <DictionaryStoreEvent<T>[]>[];
        for (let index = 0; index < ids.length; index++) {
            const id = ids[index];
            const removeItem = this.getItem(id);
            if (removeItem !== undefined) {
                delete stateCopy[id];
                events.push({ name: 'remove', item: removeItem })
                removedItems.push(removeItem);
            }
        }
        if (events.length > 0) {
            this.updateState(stateCopy)
            events.forEach(event => this.sendEvent(event))
        }
        return removedItems;
    }

    public removeItem(item: T): T | undefined {
        return this.remove(this.getId(item))
    }

    public hasId(id: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.state, id);
    }

    public getItem(id: string): T | undefined {
        return this.state[id];
    }

    public select(id: string): Observable<T> {
        return this.state$.pipe(
            map(state => state[id]),
            filter(item => !!item)
        )
    }

    protected sendEvent(event: DictionaryStoreEvent<T>) {
        this._events$.next(event);
    }

    protected updateState(state: ObjectMap<string, T>) {
        this._state$.next(state);
    }

    public async onDestroy() {
        this.onDestroy$.next(true);
    }

}