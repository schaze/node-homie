import { HomieDevice } from "./Device";
import { Observable } from "rxjs";

import { HomieNode } from "./Node";
import { HomieProperty } from "./Property";
import { DeviceQuery, NodeQuery, PropertyQuery, Query } from "./model/Query.model";
import { query, queryDevices, queryNodes, queryProperties } from "./Query";
import { map, shareReplay } from "rxjs/operators";
import { DictionaryState, DictionaryStore, OnDestroy } from "./misc";
import { mergeWatchIndex, mergeWatchList } from "./rx";

import { DeviceSelector, NodeSelector, PropertySelector } from "./model";
import { parseDeviceSelector, parseNodeSelector, parsePropertySelector } from "./util";
import { findDevice, findNode, findProperty, selectDevice, selectNode, selectProperty } from "./Selector";
import { SimpleLogger } from "./misc/Logger";

export interface IHomieDeviceManager {
    readonly devices: DictionaryState<HomieDevice>;
    readonly devices$: Observable<DictionaryState<HomieDevice>>;
}

export class HomieDeviceManager implements IHomieDeviceManager, OnDestroy {
    protected readonly log: SimpleLogger;
    public get devices() {
        return this.deviceStore.state;
    }

    protected deviceStore = new DictionaryStore<HomieDevice>(device => device.id);
    public devices$ = this.deviceStore.state$;
    public devicesChanged$ = this.deviceStore.events$;

    public devicesList$ = this.devices$.pipe(
        map(devices => Object.values(devices)),
        shareReplay(1)
    )

    public nodesList$ = this.devicesList$.pipe(
        mergeWatchList(item => item.nodesList$),
        shareReplay(1)
    )

    public nodesIndex$ = this.devicesList$.pipe(
        mergeWatchIndex(item => item.nodesIndex$),
        shareReplay(1)
    )


    public propertiesList$ = this.devicesList$.pipe(
        mergeWatchList(item => item.propertiesList$),
        shareReplay(1)
    )

    public propertiesIndex$ = this.devicesList$.pipe(
        mergeWatchIndex(item => item.propertiesIndex$),
        shareReplay(1)
    )

    constructor() {
        this.log = new SimpleLogger(this.constructor.name, 'manager');
    }


    public hasDevice(deviceId: string): boolean {
        if (!deviceId) { return false; }
        return this.deviceStore.hasId(deviceId)
    }

    public add<T extends (HomieDevice | undefined)>(device: T): T {
        if (!device) { return <T>undefined; }
        if (this.hasDevice(device.id)) {
            throw new Error(`Duplicate Device Id error. Device with ID ${device.id}, already exists!`);
        }
        return this.deviceStore.add(device) as T;
    }

    public removeDevice(deviceId: string): HomieDevice | undefined {
        return this.deviceStore.remove(deviceId);
    }

    public async destroyAllDevices() {
        return Promise.allSettled(
            Object.keys(this.devices).map((deviceId) => {
                return this.devices[deviceId].onDestroy();
            })
        )
    }


    public findDevice(selector: DeviceSelector, debounce = 10, distinct = true): Observable<HomieDevice | undefined> {
        return findDevice(this.devices$, selector, debounce, distinct);
    }

    public findNode(selector: NodeSelector, debounce = 10, distinct = true): Observable<HomieNode | undefined> {
        return findNode(this.devices$, selector, debounce, distinct);
    }

    public findProperty(selector: PropertySelector, debounce = 10, distinct = true): Observable<HomieProperty | undefined> {
        return findProperty(this.devices$, selector, debounce, distinct);
    }

    public selectDevice(selector: DeviceSelector, debounce = 10, distinct = true): Observable<HomieDevice> {
        return selectDevice(this.devices$, selector, debounce, distinct);
    }

    public selectNode(selector: NodeSelector, debounce = 10, distinct = true): Observable<HomieNode> {
        return selectNode(this.devices$, selector, debounce, distinct);
    }

    public selectProperty(selector: PropertySelector, debounce = 10, distinct = true): Observable<HomieProperty> {
        return selectProperty(this.devices$, selector, debounce, distinct);
    }


    // public makeDeviceSelector<R>(selector: DeviceSelector, predicate: (v: HomieDevice) => Observable<R>, mandatory?: boolean, debounce?: number, distinct?: boolean): Observable<R>{
    //     return makeDeviceSelector(this.devices$, selector, predicate, mandatory, debounce, distinct);
    // }

    // public makeNodeSelector<R>(selector: NodeSelector, predicate: (v: HomieNode) => Observable<R>, mandatory?: boolean, debounce?: number, distinct?: boolean): Observable<R>{
    //     return makeNodeSelector(this.devices$, selector, predicate, mandatory, debounce, distinct);
    // }

    // public makePropertySelector<R>( selector: PropertySelector, predicate: (v: HomieProperty) => Observable<R>, mandatory?: boolean, debounce?: number, distinct?: boolean): Observable<R>{
    //    return makePropertySelector(this.devices$, selector, predicate, mandatory, debounce, distinct);
    // }

    public queryDevices(query: DeviceQuery, debounce = 500): Observable<HomieDevice[]> {
        return queryDevices(this.devicesList$, query, debounce);
    }

    public queryNodes(query: NodeQuery, debounce = 500): Observable<HomieNode[]> {
        return queryNodes(this.devicesList$, query, debounce);
    }

    public queryProperties(query: PropertyQuery, debounce = 500): Observable<HomieProperty[]> {
        return queryProperties(this.queryNodes(null, debounce), query, debounce);
    }

    public query(q: Query, debounce = 500): Observable<HomieProperty[]> {
        return query(this.devicesList$, q, debounce)
    }

    public getDevice(selector: DeviceSelector): HomieDevice | undefined {
        if (!selector) { return undefined; }
        const designator = parseDeviceSelector(selector)
        return this.devices[designator.deviceId];
    }

    public getNode(selector: NodeSelector): HomieNode | undefined {
        if (!selector) { return undefined; }
        const designator = parseNodeSelector(selector)
        return this.getDevice(designator)?.nodes[designator.nodeId];
    }

    public getProperty(selector: PropertySelector | undefined | null): HomieProperty | undefined {
        if (!selector) { return undefined; }
        const designator = parsePropertySelector(selector)
        return this.getNode(designator)?.properties[designator.propertyId];
    }

    public getPropertyValue(selector: PropertySelector): string | undefined {
        if (!selector) { return undefined; }
        return this.getProperty(selector)?.value;
    }


    async onDestroy(): Promise<void> {
        await this.destroyAllDevices();
    }
}