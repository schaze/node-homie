import { HomieDeviceMode, HomieID, MQTTConnectOpts } from "./model";
import { HomieDevice } from "./Device";
import { Observable, of, Subject, timer } from "rxjs";
import { RxMqtt } from "./mqtt";
import { OnDestroy, OnInit } from "./misc";
import { tap } from "rxjs/internal/operators/tap";
import { bufferTime, concatMap, delay, delayWhen, filter, mergeMap, takeUntil } from "rxjs/operators";
import { SimpleLogger } from "./misc/Logger";

export type DiscoveryEventType = 'add' | 'remove' | 'error';

export interface BaseDiscoveryEvent<T extends DiscoveryEventType> {
    type: T;
}

export interface AddDiscoveryEvent extends BaseDiscoveryEvent<'add'> {
    deviceId: HomieID;
    retained: boolean;
    makeDevice: () => HomieDevice;
}

export interface RemoveDiscoveryEvent extends BaseDiscoveryEvent<'remove'> {
    deviceId: HomieID;
}

export interface ErrorDiscoveryEvent extends BaseDiscoveryEvent<'error'> {
    error?: Error;
}

export type DiscoveryEvent = AddDiscoveryEvent | RemoveDiscoveryEvent | ErrorDiscoveryEvent;


const BUFFERTIME = 250;
const BUFFERSIZE = 10;
const RATELIMIT = 250; // emit max BUFFERSIZE amount of events within RATELIMIT ms
const NONREATAINEDDELAY = 3000;

export class DeviceDiscovery implements OnInit, OnDestroy {
    protected readonly log: SimpleLogger;
    protected onDestroy$ = new Subject<boolean>();

    protected mqtt: RxMqtt;

    protected _discoveryEvents$ = new Subject<Observable<DiscoveryEvent>>();


    constructor(
        protected mqttOpts: MQTTConnectOpts,
        protected useSharedMQTTClient = false,
        protected nonRetainedDiscoveryDelay = NONREATAINEDDELAY,
        protected rateLimit = RATELIMIT,
        protected bufferTimeLimit = BUFFERTIME,
        protected bufferSize = BUFFERSIZE) {
        this.log = new SimpleLogger(this.constructor.name, 'discovery');
        this.mqtt = new RxMqtt(this.mqttOpts);
    }

    public events$ = this._discoveryEvents$.asObservable().pipe(
        // Buffer emissions to reduce peak loads for clients
        // @ts-ignore:
        bufferTime(this.bufferTimeLimit, undefined, this.bufferSize),
        // do nothing on empty buffers
        filter(events => events.length > 0),
        // apply at least RATELIMIT delay on new events
        // @ts-ignore: 
        concatMap(events => of(events).pipe(delay(this.rateLimit))),
        // merge buffer into single event observable stream
        mergeMap(events => events),
        // merge down observable of event to event objects, apply delay for non-retained and remove messages
        // @ts-ignore: 
        mergeMap(event => event.pipe(delayWhen(event => (event.type === 'add' && !event.retained) || event.type === 'remove' ? timer(this.nonRetainedDiscoveryDelay) : timer(0))))
    );


    public async onInit() {
        await this.mqtt.onInit();

        const sub = this.mqtt.subscribe(`${this.mqttOpts.topicRoot}/+/$homie`);

        sub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
            next: msg => {
                const { topic, payload, packet } = msg;

                const relTopic = topic.split(this.mqttOpts.topicRoot + '/')[1];
                const [deviceId] = relTopic.split('/');

                if (payload.length === 0) { // device removal
                    this.nextEvent(<RemoveDiscoveryEvent>{ type: 'remove', deviceId: deviceId });
                    return;
                }
                this.nextEvent(<AddDiscoveryEvent>{
                    type: 'add', retained: packet.retain, deviceId,
                    makeDevice: () => this.makeDevice(deviceId, payload.toString())
                })
            },
            error: (err) => {
                this.log.error('Error in discovery loop. No new devices will be discovered: ', { error: err });
                this.nextEvent(<ErrorDiscoveryEvent>{ type: 'error', error: err });
            }
        });

        sub.activate();
    }

    public async onDestroy() {
        this.onDestroy$.next(true);
        try {
            this.mqtt.onDestroy();
            this.log.debug('mqtt connecition closed.');
        } catch (err) {
            this.log.error('Error closing mqtt connection: ', err);
        }
    }

    protected nextEvent(event: DiscoveryEvent) {
        this._discoveryEvents$.next(of(event));
    }


    public makeDevice(id: HomieID, homie: string): HomieDevice {
        return new HomieDevice({ id, homie }, this.useSharedMQTTClient ? this.mqtt : this.mqttOpts, HomieDeviceMode.Controller);
    }


}
