import { HomieDevice } from "./HomieDevice";
import { asyncScheduler, combineLatest, Observable, of } from "rxjs";
import { distinctUntilChanged, map, switchMap, throttleTime } from "rxjs/operators";

import { DeviceQuery, NodeQuery, PropertyQuery, Query, RXObjectQuery } from "./model/Query.model";
import { HomieProperty } from "./HomieProperty";
import { evaluateObjectCondition } from "./util";
import { HomieNode } from "./HomieNode";
import { DeviceAttributes, NodeAttributes, ObjectMap, PropertyAttributes, RXObjectAttributes } from "./model";
import { RXObject } from "./RXObject";
import { flattenAndRemoveNullish, removeNullish } from "./rx";


export function queryRXObjects<TObj extends RXObject<TAttribute>, TAttribute extends RXObjectAttributes>(objs$: Observable<TObj[] | ObjectMap<string, TObj>>, query: RXObjectQuery<TAttribute>, debounce = 500, idAttr: string = 'id',): Observable<TObj[]> {
    const queryResult = objs$.pipe(
        // As this can lead to a lot of emits, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),

        // subscribe to all attributes$ of all objects. Whenever there is any attributes change in any device the whole updated list is evaluated
        // This is very inefficient as for all changes everyhing is reevaluated all the time.
        // TODO: It would be better to only check for the change device and decide based on that if a new emission is needed
        switchMap(objs => {
            const objArray = Array.isArray(objs) ? objs : Object.values(objs)

            // if there was no result for the devices, return an empty array, the select function should always return a result, even an empty one
            if (objArray.length === 0) {
                return of(<TObj[]>[]);
            }

            const objAttrs$ = [];
            for (let index = 0; index < objArray.length; index++) {
                const obj = objArray[index];
                objAttrs$.push(obj.attributes$.pipe(
                    map(attrs => {
                        // console.log(`Evaluate:`, attrs, ' ==> ', query);
                        if (((query !== null && query !== undefined) && evaluateObjectCondition(attrs, query, idAttr)) || (query === null || query === undefined)) {
                            return obj;
                        } else {
                            return null;
                        }
                    }),
                    distinctUntilChanged()
                ));
            }
            return combineLatest(
                objAttrs$
            )
        }),
        // As this can lead to a lot of emits, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
        // filter resulting object list for non null
        removeNullish()
    );

    return (query === undefined || query === null || query === '*') ?
        objs$.pipe(map(objs => Array.isArray(objs) ? objs : Object.values(objs))) : queryResult;
}



export function queryChildElements<TParent extends RXObject<TParentAttrs>, TParentAttrs extends RXObjectAttributes, TChild extends RXObject<TChildAttrs>, TChildAttrs extends RXObjectAttributes>
    (parents$: Observable<TParent[] | ObjectMap<string, TParent>>, query: RXObjectQuery<TChildAttrs>, getChildren: (parent: TParent) => Observable<ObjectMap<string, TChild>>, debounce = 500): Observable<TChild[]> {

    return parents$.pipe(
        switchMap(parents => {

            const parentsArray = Array.isArray(parents) ? parents : Object.values(parents)

            const empty: Array<TChild | null> = [];
            // if there was no result for the devices, return an empty array, the select function should always return a result, even an empty one
            if (parentsArray.length === 0) {
                return of([empty]);
            }

            // subscribe to all attributes$ of all nodes of all devices emitted by devices$
            // Whenever there is any attributes change in any node the whole updated list is evaluated again
            const childAttrs$ = [];
            // iterate all devices
            for (let index = 0; index < parentsArray.length; index++) {
                const parent = parentsArray[index];
                // create a list of obeservables based on the device's nodes
                childAttrs$.push(
                    queryRXObjects<TChild, TChildAttrs>(getChildren(parent), query, 0)
                )

            }
            return combineLatest(
                childAttrs$
            );
        }),
        // As this can lead to a lot of emit, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),

        // flatten and filter resulting nodes list for non null
        flattenAndRemoveNullish(),
    );
}


export function queryDevices(devices$: Observable<HomieDevice[] | ObjectMap<string, HomieDevice>>, query: DeviceQuery, debounce = 500): Observable<HomieDevice[]> {
    return queryRXObjects(devices$, query, debounce);
}

export function queryNodes(devices$: Observable<HomieDevice[] | ObjectMap<string, HomieDevice>>, query: NodeQuery, debounce = 500): Observable<HomieNode[]> {
    return queryChildElements<HomieDevice, DeviceAttributes, HomieNode, NodeAttributes>(devices$, query, (d: HomieDevice) => d.nodes$, debounce);
}

export function queryProperties(nodes$: Observable<HomieNode[] | ObjectMap<string, HomieNode>>, query: PropertyQuery, debounce = 500): Observable<HomieProperty[]> {
    return queryChildElements<HomieNode, NodeAttributes, HomieProperty, PropertyAttributes>(nodes$, query, o => o.properties$, debounce);
}

export function query(devices$: Observable<HomieDevice[] | ObjectMap<string, HomieDevice>>, q: Query, debounce = 500) {

    const filteredDevices = queryDevices(devices$, q.device, debounce);
    const nodes = queryNodes(filteredDevices, q.node, debounce);
    const properties = queryProperties(nodes, q.property, debounce);

    return properties;

}
