import { OperatorFunction, Observable, switchMap, of, map } from "rxjs";
import { HomieDevice } from "./HomieDevice";
import { HomieNode } from "./HomieNode";
import { HomieProperty, OnSetEvent } from "./HomieProperty";
import { HomieID, DeviceAttributes, NodeAttributes, PropertyAttributes, DeviceState, ObjectMap } from "./model";
import { mandatoryPluck } from "./rx";


export function device$(deviceId: HomieID): OperatorFunction<ObjectMap<string, HomieDevice>, HomieDevice> {
    return (source: Observable<ObjectMap<string, HomieDevice>>): Observable<HomieDevice> => {
        return source.pipe(mandatoryPluck(deviceId));
    }
}

export function deviceAttrs$(): OperatorFunction<HomieDevice, DeviceAttributes> {
    return (source: Observable<HomieDevice>): Observable<DeviceAttributes> => {
        return source.pipe(switchMap(d => d.attributes$));
    }
}

export function state$(): OperatorFunction<HomieDevice, DeviceState> {
    return (source: Observable<HomieDevice>): Observable<DeviceState> => {
        return source.pipe(switchMap(d => d.state$));
    }
}

export function version$(): OperatorFunction<HomieDevice, number> {
    return (source: Observable<HomieDevice>): Observable<number> => {
        return source.pipe(switchMap(d => d.attributes$.pipe(map(attrs => attrs.version))));
    }
}



export function node$(nodeId: HomieID): OperatorFunction<ObjectMap<string, HomieNode> | HomieDevice, HomieNode> {
    return (source: Observable<ObjectMap<string, HomieNode> | HomieDevice>): Observable<HomieNode> => {
        return source.pipe(
            switchMap(v => {
                if (v instanceof HomieDevice) {
                    return v.nodes$;
                } else {
                    return of(v);
                }
            }),
            mandatoryPluck(nodeId)
        )
    }
}


export function nodeAttrs$(): OperatorFunction<HomieNode, NodeAttributes> {
    return (source: Observable<HomieNode>): Observable<NodeAttributes> => {
        return source.pipe(switchMap(n => n.attributes$));
    }
}


export function property$(propId: HomieID): OperatorFunction<HomieNode, HomieProperty> {
    return (source: Observable<HomieNode>): Observable<HomieProperty> => {
        return source.pipe(switchMap(n => n.properties$), mandatoryPluck(propId));
    }
}


export function onSetMessage$(): OperatorFunction<HomieProperty, OnSetEvent> {
    return (source: Observable<HomieProperty>): Observable<OnSetEvent> => {
        return source.pipe(switchMap(p => p.onSetMessage$));
    }
}

export function value$(): OperatorFunction<HomieProperty, string | undefined> {
    return (source: Observable<HomieProperty>): Observable<string | undefined> => {
        return source.pipe(switchMap(p => p.value$));
    }
}

export function propAttrs$(): OperatorFunction<HomieProperty, PropertyAttributes> {
    return (source: Observable<HomieProperty>): Observable<PropertyAttributes> => {
        return source.pipe(switchMap(p => p.attributes$));
    }
}

