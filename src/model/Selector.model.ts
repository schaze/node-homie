/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */


import { Observable } from "rxjs";
import { HomieNode, HomieProperty, HomieDevice } from "..";
import { HomieID } from "./Base.model";
import { DevicePointer, isDevicePointer, NodePointer, isNodePointer, PropertyPointer, isPropertyPointer } from "./Base.model";

export type DeviceSelector = DevicePointer | DeviceDesignator;
export function isDeviceSelector(selector: unknown): selector is DeviceSelector {
    return isDeviceDesignator(selector) || isDevicePointer(selector);
}

export type NodeSelector = NodePointer | NodeDesignator;
export function isNodeSelector(selector: unknown): selector is NodeSelector {
    return isNodeDesignator(selector) || isNodePointer(selector);
}

export type PropertySelector = PropertyPointer | PropertyDesignator;
export function isPropertySelector(selector: unknown): selector is PropertySelector {
    return isPropertyDesignator(selector) || isPropertyPointer(selector);
}


export type SelectorOptions<R> =
    { selector: DeviceSelector, predicate: (v: HomieDevice) => Observable<R> } |
    { selector: NodeSelector, predicate: (v: HomieNode) => Observable<R> } |
    { selector: PropertySelector, predicate: (v: HomieProperty) => Observable<R> };



export interface DeviceDesignator {
    deviceId: HomieID;
}
export function isDeviceDesignator(designator: any): designator is DeviceDesignator {
    return designator !== undefined && designator !== null && typeof designator === 'object' && !!designator.deviceId && !designator.nodeId && !designator.propertyId;
}
export interface NodeDesignator extends DeviceDesignator {
    nodeId: HomieID;
}
export function isNodeDesignator(designator: any): designator is NodeDesignator {
    return designator !== undefined && designator !== null && typeof designator === 'object' && !!designator.deviceId && !!designator.nodeId && !designator.propertyId;
}
export interface PropertyDesignator extends NodeDesignator {
    propertyId: HomieID;
}
export function isPropertyDesignator(designator: any): designator is PropertyDesignator {
    return designator !== undefined && designator !== null && typeof designator === 'object' && !!designator.deviceId && !!designator.nodeId && !!designator.propertyId;
}
