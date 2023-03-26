import { MonoTypeOperatorFunction, Observable, race, timer } from "rxjs";
import { pluck, filter, take, tap, mapTo, switchMap, map } from "rxjs/operators";
import { HomieDevice } from "..";
import { HomieElement } from "../HomieElement";
import { HomieDeviceMode, HomieElementDescription, HomieElementPointer, HomieID, IDAttributeImpl } from "../model";
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


export function filterExternal<T, P>(item: T, predicate: (value: T) => Observable<boolean>): MonoTypeOperatorFunction<P> {
    return <P>(source: Observable<P>) => {
        return source.pipe(
            switchMap(source => predicate(item).pipe(filter(r => r), map(r => source)))
        )
    }
}
