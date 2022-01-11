import { HomieDevice } from "./Device";
import { asyncScheduler, combineLatest, Observable, of } from "rxjs";
import { distinctUntilChanged, map, switchMap, tap, throttleTime } from "rxjs/operators";

import { DeviceQuery, NodeQuery, PropertyQuery, Query } from "./model/Query.model";
import { HomieProperty } from "./Property";
import { DictionaryState } from "./misc";
import { evaluateBaseItemCondition } from "./util";
import { HomieNode } from "./Node";

export function queryDevices(devices$: Observable<HomieDevice[] | DictionaryState<HomieDevice>>, query: DeviceQuery, debounce = 500): Observable<HomieDevice[]> {
    const filteredDevices = devices$.pipe(
        // subscribe to all attributes$ of all devices. Whenever there is any attributes change in any device the whole updated list is evaluated
        // This is very inefficient as for all changes everyhing is reevaluated all the time.
        // TODO: It would be better to only check for the change device and decide based on that if a new emission is needed
        switchMap(devices => {
            const devicesArray = Array.isArray(devices) ? devices : Object.values(devices)
            const devicesAttrs$ = [];
            for (let index = 0; index < devicesArray.length; index++) {
                const device = devicesArray[index];
                devicesAttrs$.push(device.attributes$.pipe(
                    map(attrs => {
                        if ((query && evaluateBaseItemCondition(attrs, query)) || !query) {
                            return device;
                        } else {
                            return null;
                        }
                    }),
                    distinctUntilChanged()
                ));
            }
            return combineLatest(
                devicesAttrs$
            )
        }),
        // As this can lead to a lot of emit, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
        // filter resulting device list for non null
        map(d => {
            const filtered = [];
            for (let index = 0; index < d.length; index++) {
                const device = d[index];
                if (device !== null) {
                    filtered.push(device);
                }
            }
            return filtered;
        })
    );

    return (query === undefined || query === null || query === '*') ?
        devices$.pipe(map(devices => Array.isArray(devices) ? devices : Object.values(devices))) : filteredDevices;
}

export function queryNodes(devices$: Observable<HomieDevice[] | DictionaryState<HomieDevice>>, query: NodeQuery, debounce = 500): Observable<HomieNode[]> {
    if (query === undefined || query === null || query === '*') {
        return devices$.pipe(
            switchMap(devices => {
                const devicesArray = Array.isArray(devices) ? devices : Object.values(devices)

                const empty: Array<HomieNode> = [];
                // if there was no result for the devices, return an empty array, the select function should always return a result, even an empty one
                if (devicesArray.length === 0) {
                    return of([empty]);
                }
                
                // subscribe to all attributes$ of all nodes of all devices emitted by devices$
                // Whenever there is any attributes change in any node the whole updated list is evaluated again
                const nodesAttrs$ = [];

                for (let index = 0; index < devicesArray.length; index++) {
                    const device = devicesArray[index];
                    // create a list of obeservables based on the device's nodes
                    nodesAttrs$.push(device.nodesList$)
                }
                return combineLatest(
                    nodesAttrs$
                );
            }),
            // As this can lead to a lot of emit, we throttle time by default to 500ms
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            // flatten and filter resulting nodes list for non null
            map(d => {
                const flattened = [];

                for (let index = 0; index < d.length; index++) {
                    const dataSet = d[index];
                    for (let indexSet = 0; indexSet < dataSet.length; indexSet++) {
                        const node = dataSet[indexSet];
                        flattened.push(node);

                    }
                }
                return flattened;
            })

        )
    }


    const nodes = devices$.pipe(
        switchMap(devices => {

            const devicesArray = Array.isArray(devices) ? devices : Object.values(devices)

            const empty: Array<HomieNode | null> = [];
            // if there was no result for the devices, return an empty array, the select function should always return a result, even an empty one
            if (devicesArray.length === 0) {
                return of([empty]);
            }


            // subscribe to all attributes$ of all nodes of all devices emitted by devices$
            // Whenever there is any attributes change in any node the whole updated list is evaluated again
            const nodesAttrs$ = [];
            // iterate all devices
            for (let index = 0; index < devicesArray.length; index++) {
                const device = devicesArray[index];
                // create a list of obeservables based on the device's nodes
                nodesAttrs$.push(
                    device.nodes$.pipe(
                        // switch inner observable for the nodes to a combined observable of all the node attributes$ observables
                        // mapped to the node itself on emission (if query is met) or null if not met 
                        switchMap(nodes => {
                            const nodesList = Object.values(nodes);
                            if (nodesList.length === 0) {
                                return of(empty);
                            }
                            const deviceNodesAttrs$ = [];
                            for (let index = 0; index < nodesList.length; index++) {
                                const node = nodesList[index];
                                deviceNodesAttrs$.push(
                                    node.attributes$.pipe(
                                        map(attrs => {
                                            if ((query && evaluateBaseItemCondition(attrs, query)) || !query) {
                                                return node;
                                            } else {
                                                return null;
                                            }
                                        }),
                                        distinctUntilChanged()
                                    ));
                            }
                            return combineLatest(deviceNodesAttrs$).pipe(
                                map(nodes => {
                                    const filtered = [];
                                    for (let index = 0; index < nodes.length; index++) {
                                        const node = nodes[index];
                                        if (node) {
                                            filtered.push(node);
                                        }
                                    }
                                    return filtered;
                                })
                            );
                        })
                    )
                )
            }
            return combineLatest(
                nodesAttrs$
            );
        }),
        // As this can lead to a lot of emit, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
        // flatten and filter resulting nodes list for non null
        map(d => {
            const filtered = [];

            for (let index = 0; index < d.length; index++) {
                const dataSet = d[index];
                for (let indexSet = 0; indexSet < dataSet.length; indexSet++) {
                    const node = dataSet[indexSet];
                    if (node !== null) {
                        filtered.push(node);
                    }
                }
            }

            return filtered;
        })
    );

    return nodes;

}


export function queryProperties(nodes$: Observable<HomieNode[] | DictionaryState<HomieNode>>, query: PropertyQuery, debounce = 500): Observable<HomieProperty[]> {

    if (query === undefined || query === null || query === '*') {
        return nodes$.pipe(
            switchMap(nodes => {
                const nodesArray = Array.isArray(nodes) ? nodes : Object.values(nodes)

                const empty: Array<HomieProperty> = [];
                // if there was no result for the nodes, return an empty array, the select function should always return a result, even an empty one
                if (nodesArray.length === 0) {
                    return of([empty]);
                }
                // subscribe to all attributes$ of all properties of all nodes found in the previous step. 
                // Whenever there is any attributes change in any property the whole updated list is evaluated again
                const propertiesAttrs$ = [];
                for (let index = 0; index < nodesArray.length; index++) {
                    const node = nodesArray[index];
                    propertiesAttrs$.push(
                        node.propertiesList$
                    )
                }
                return combineLatest(
                    propertiesAttrs$
                );
            }),
            // As this can lead to a lot of emit, we throttle time by default to 500ms
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            // flatten and filter resulting properties list based for non null
            map(d => {
                const flattened = [];

                for (let index = 0; index < d.length; index++) {
                    const dataSet = d[index];
                    for (let indexSet = 0; indexSet < dataSet.length; indexSet++) {
                        const property = dataSet[indexSet];
                        flattened.push(property);
                    }
                }

                return flattened;
            })
        );

    }


    const properties = nodes$.pipe(
        switchMap(nodes => {
            const nodesArray = Array.isArray(nodes) ? nodes : Object.values(nodes)

            const empty: Array<HomieProperty> = [];
            // if there was no result for the nodes, return an empty array, the select function should always return a result, even an empty one
            if (nodesArray.length === 0) {
                return of([empty]);
            }
            // subscribe to all attributes$ of all properties of all nodes found in the previous step. 
            // Whenever there is any attributes change in any property the whole updated list is evaluated again
            const propertiesAttrs$ = [];
            for (let index = 0; index < nodesArray.length; index++) {
                const node = nodesArray[index];
                propertiesAttrs$.push(
                    node.properties$.pipe(
                        switchMap(properties => {
                            const propertiesList = Object.values(properties);
                            if (propertiesList.length === 0) {
                                return of(empty);
                            }
                            const nodePropertiesAttrs$ = [];
                            for (let index = 0; index < propertiesList.length; index++) {
                                const property = propertiesList[index];
                                nodePropertiesAttrs$.push(
                                    property.attributes$.pipe(
                                        map(attrs => {
                                            if ((query && evaluateBaseItemCondition(attrs, query)) || !query) {
                                                return property;
                                            } else {
                                                return null;
                                            }
                                        }),
                                        distinctUntilChanged()
                                    )

                                );
                            }
                            return combineLatest(nodePropertiesAttrs$).pipe(
                                map(properties => {
                                    const filtered = [];
                                    for (let index = 0; index < properties.length; index++) {
                                        const property = properties[index];
                                        if (property) {
                                            filtered.push(property);
                                        }
                                    }
                                    return filtered;
                                })
                            );
                        })
                    )
                )
            }
            return combineLatest(
                propertiesAttrs$
            );
        }),
        // As this can lead to a lot of emit, we throttle time by default to 500ms
        throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
        // flatten and filter resulting properties list based for non null
        map(d => {
            const filtered = [];

            for (let index = 0; index < d.length; index++) {
                const dataSet = d[index];
                for (let indexSet = 0; indexSet < dataSet.length; indexSet++) {
                    const property = dataSet[indexSet];
                    if (property !== null) {
                        filtered.push(property);
                    }
                }
            }

            return filtered;
        })
    );


    return properties;
}

export function query(devices$: Observable<HomieDevice[] | DictionaryState<HomieDevice>>, q: Query, debounce = 500) {

    const filteredDevices = queryDevices(devices$, q.device, debounce);
    const nodes = queryNodes(filteredDevices, q.node, debounce);
    const properties = queryProperties(nodes, q.property, debounce);

    return properties;

}
