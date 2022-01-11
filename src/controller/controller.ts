import { MonoTypeOperatorFunction, Observable, race, timer } from "rxjs";
import { pluck, filter, take, tap, mapTo, switchMap } from "rxjs/operators";
import { HomieDevice, HomieNode, HomieProperty } from "..";
import { HomieBase, HomieItemBase } from "../homie-base";
import { BaseAtrributes, DeviceState, HomieDeviceMode, HomieID } from "../model";
import { MQTTConnectOpts } from "../model";

/**
 * Returns an observable that will emit if the device with the given ID has state disconnected/lost or timeout occurs.
 * 
 * @param id HomieID of the device to check
 * @param mqttOpts MQTT connection options
 * @param timeout timeout to wait for disconnected/lost state
 * @returns true if device is disconnected or lost, false if timeout occured.
 */
export function waitForPreviousControllerDown$(id: HomieID, mqttOpts: MQTTConnectOpts, timeout: number = -1): Observable<boolean> {
    const controllerDeviceDiscover = new HomieDevice({ id }, mqttOpts, HomieDeviceMode.Controller);

    const state$ = controllerDeviceDiscover.attributes$.pipe(
        pluck('state'),
        filter(state => state === 'disconnected' || state === 'lost'),
        take(1),
        mapTo(true)
    );
    
    controllerDeviceDiscover.onInit();

    if (timeout === -1) {
        return state$.pipe(
            tap(async _ => {
                await controllerDeviceDiscover.onDestroy();
            })
        );
    } else {
        return race(state$, timer(timeout).pipe(
            tap(async _ => {
                await controllerDeviceDiscover.onDestroy();
            }),
            mapTo(false))
        );
    }
}


export function filterForAttribute<T, P extends HomieBase<BaseAtrributes> | undefined, R extends BaseAtrributes, K extends keyof R>(homieItem: HomieItemBase<P, R>, key: K, predicate: (value: R[K]) => boolean): MonoTypeOperatorFunction<T> {
    return <T>(source: Observable<T>) => {

        return source.pipe(
            switchMap(source => homieItem.attributes$.pipe(pluck(key), filter(attr => predicate(attr)), mapTo(source)))
        );
    }
}