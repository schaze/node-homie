import {
    isDevicePointer, isNodePointer, isPropertyPointer,
    DeviceDesignator, DeviceSelector, NodeDesignator,
    NodeSelector, PropertyDesignator, PropertySelector, PropertyPointer, DevicePointer, NodePointer
} from "../model";


export function asDevicePointer(selector: DeviceSelector): DevicePointer{
    if (isDevicePointer(selector)){ return selector; }
    return selector.deviceId;
}

export function asNodePointer(selector: NodeSelector): NodePointer{
    if (isNodePointer(selector)){ return selector; }
    return `${selector.deviceId}/${selector.nodeId}`;
}


export function asPropertyPointer(selector: PropertySelector): PropertyPointer{
    if (isPropertyPointer(selector)){ return selector; }
    return `${selector.deviceId}/${selector.nodeId}/${selector.propertyId}`;
}


export function parseDeviceSelector(pointer: DeviceSelector): DeviceDesignator {
    if (isDevicePointer(pointer)) {
        return { deviceId: pointer };
    } else {
        return pointer
    }
}

export function parseNodeSelector(pointer: NodeSelector): NodeDesignator {
    // if (pointer === null || pointer === undefined) { return null; }
    if (isNodePointer(pointer)) {
        const [deviceId, nodeId] = pointer.split('/');
        return { deviceId, nodeId };
    } else {
        return pointer
    }

}

export function parsePropertySelector(pointer: PropertySelector): PropertyDesignator {
    // if (pointer === null || pointer === undefined) { return null; }
    if (isPropertyPointer(pointer)) {
        const [deviceId, nodeId, propertyId] = pointer.split('/');
        return { deviceId, nodeId, propertyId };
    } else {
        return pointer
    }
}

