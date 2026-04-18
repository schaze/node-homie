import { HomieDevice } from "./HomieDevice";
import { asyncScheduler, Observable } from "rxjs";
import { distinctUntilChanged, throttleTime } from "rxjs/operators";
import { HomieNode } from "./HomieNode";
import { HomieProperty } from "./HomieProperty";
import {
    mandatoryPluck, mandatoryPluckSwitchMap, mandatorySwitchMap, optionalPluck, optionalPluckSwitchMap, optionalSwitchMap
} from "./rx";
import {
    DeviceSelector, NodeSelector, ObjectMap, PropertySelector
} from "./model";
import { parseDeviceSelector, parseNodeSelector, parsePropertySelector } from "./util";


/**
 * Searches for a device - will emit regardless if the device is found or not. if not found Observable of undefined will be returned
 * 
 * @param devices$ Observable of devices
 * @param deviceSelector
 * @param debounce 
 * @param distinct 
 * @returns Obeservable of the device or of undefined if not found
 */
export function findDevice(devices$: Observable<ObjectMap<string,HomieDevice>>, deviceSelector: DeviceSelector, debounce = 10, distinct = true): Observable<HomieDevice | undefined> {
    const designator = parseDeviceSelector(deviceSelector);
    let resObs: Observable<HomieDevice | undefined>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluck(designator.deviceId)
        )
    } else {
        resObs = devices$.pipe(
            optionalPluck(designator.deviceId)
        )
    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}



/**
 * Selects a device - will _only_ emit _if_ the device is _found_
 * @param devices$ 
 * @param deviceSelector 
 * @param debounce 
 * @param distinct 
 * @returns Observable of a devices
 */
export function selectDevice(devices$: Observable<ObjectMap<string,HomieDevice>>, deviceSelector: DeviceSelector, debounce = 10, distinct = true): Observable<HomieDevice> {
    const designator = parseDeviceSelector(deviceSelector);
    let resObs: Observable<HomieDevice>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluck(designator.deviceId)
        )
    } else {
        resObs = devices$.pipe(
            mandatoryPluck(designator.deviceId)
        )
    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}




export function findNode(devices$: Observable<ObjectMap<string,HomieDevice>>, nodeSelector: NodeSelector, debounce = 10, distinct = true): Observable<HomieNode | undefined> {
    const designator = parseNodeSelector(nodeSelector);
    let resObs: Observable<HomieNode | undefined>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluckSwitchMap(designator.deviceId, device => device?.nodes$),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluck(designator.nodeId)
        );

    } else {
        resObs = devices$.pipe(
            optionalPluckSwitchMap(designator.deviceId, device => device?.nodes$),
            optionalPluck(designator.nodeId)
        );

    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}



export function selectNode(devices$: Observable<ObjectMap<string,HomieDevice>>, nodeSelector: NodeSelector, debounce = 10, distinct = true): Observable<HomieNode> {
    const designator = parseNodeSelector(nodeSelector);
    let resObs: Observable<HomieNode>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluckSwitchMap(designator.deviceId, device => device?.nodes$),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluck(designator.nodeId)
        )

    } else {
        resObs = devices$.pipe(
            mandatoryPluckSwitchMap(designator.deviceId, device => device?.nodes$),
            mandatoryPluck(designator.nodeId)
        )

    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}



export function findProperty(devices$: Observable<ObjectMap<string,HomieDevice>>, propertySelector: PropertySelector, debounce = 10, distinct = true): Observable<HomieProperty | undefined> {
    const designator = parsePropertySelector(propertySelector);
    let resObs: Observable<HomieProperty | undefined>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluckSwitchMap(designator.deviceId, device => device?.nodes$, true),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluckSwitchMap(designator.nodeId, node => node?.properties$, true),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            optionalPluck(designator.propertyId)
        );
    } else {
        resObs = devices$.pipe(
            optionalPluckSwitchMap(designator.deviceId, device => device?.nodes$, true),
            optionalPluckSwitchMap(designator.nodeId, node => node?.properties$, true),
            optionalPluck(designator.propertyId)
        );
    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}

export function selectProperty(devices$: Observable<ObjectMap<string,HomieDevice>>, propertySelector: PropertySelector, debounce = 10, distinct = true): Observable<HomieProperty> {
    const designator = parsePropertySelector(propertySelector);
    let resObs: Observable<HomieProperty>;
    if (debounce > 0) {
        resObs = devices$.pipe(
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluckSwitchMap(designator.deviceId, device => device?.nodes$, true),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluckSwitchMap(designator.nodeId, node => node?.properties$, true),
            throttleTime(debounce, asyncScheduler, { leading: true, trailing: true }),
            mandatoryPluck(designator.propertyId)
        )
    } else {
        resObs = devices$.pipe(
            mandatoryPluckSwitchMap(designator.deviceId, device => device?.nodes$, true),
            mandatoryPluckSwitchMap(designator.nodeId, node => node?.properties$, true),
            mandatoryPluck(designator.propertyId)
        )
    }
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}

export function makeDeviceSelector<R>(devices$: Observable<ObjectMap<string,HomieDevice>>, selector: DeviceSelector, predicate: (v: HomieDevice) => Observable<R>, debounce?: number, distinct?: boolean): Observable<R> {
    const resObj = selectDevice(devices$, selector, debounce, distinct).pipe(mandatorySwitchMap(predicate))
    return distinct ? resObj.pipe(distinctUntilChanged()) : resObj;
}

export function makeNodeSelector<R>(devices$: Observable<ObjectMap<string,HomieDevice>>, selector: NodeSelector, predicate: (v: HomieNode) => Observable<R>, debounce?: number, distinct?: boolean): Observable<R> {
    let resObs = selectNode(devices$, selector, debounce, distinct).pipe(mandatorySwitchMap(predicate));
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}

export function makePropertySelector<R>(devices$: Observable<ObjectMap<string,HomieDevice>>, selector: PropertySelector, predicate: (v: HomieProperty) => Observable<R>, mandatory?: boolean, debounce?: number, distinct?: boolean): Observable<R> {
    let resObs = selectProperty(devices$, selector, debounce, distinct).pipe(mandatorySwitchMap(predicate));
    return distinct ? resObs.pipe(distinctUntilChanged()) : resObs;
}
