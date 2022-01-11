/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type DevicePointer = string;
export const DevicePointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isDevicePointer(pointer: any): pointer is DevicePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(DevicePointerRegex);
}

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type NodePointer = string;
export const NodePointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isNodePointer(pointer: any): pointer is NodePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(NodePointerRegex);
}

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type PropertyPointer = string;
export const PropertyPointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isPropertyPointer(pointer: any): pointer is NodePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(PropertyPointerRegex);
}


