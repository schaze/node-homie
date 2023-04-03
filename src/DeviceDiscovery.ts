import { HomieDeviceMode, HomieID, MQTTConnectOpts } from "./model";
import { HD_ATTR_STATE, HomieDevice } from "./HomieDevice";
import { Observable, of, Subject, timer } from "rxjs";
import { RxMqtt } from "./mqtt";
import { LifecycleBase } from "./misc";
import { bufferTime, concatMap, delay, delayWhen, filter, mergeMap, takeUntil } from "rxjs/operators";
import { SimpleLogger } from "./misc/Logger";
import { makeV5BaseTopic } from "./util";

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

export class DeviceDiscovery extends LifecycleBase {
    protected readonly log: SimpleLogger;

    protected mqtt: RxMqtt;

    protected _discoveryEvents$ = new Subject<Observable<DiscoveryEvent>>();


    constructor(
        protected mqttOpts: MQTTConnectOpts,
        protected sharedMQTTClient?: RxMqtt,
        protected nonRetainedDiscoveryDelay = NONREATAINEDDELAY,
        protected rateLimit = RATELIMIT,
        protected bufferTimeLimit = BUFFERTIME,
        protected bufferSize = BUFFERSIZE
    ) {
        super();
        this.log = new SimpleLogger(this.constructor.name, 'discovery');

        const stateTopic = `${makeV5BaseTopic(this.mqttOpts.topicRoot)}/+/${HD_ATTR_STATE}`;
        this.mqtt = new RxMqtt(this.mqttOpts, { whiteListTopics: [stateTopic] });
        if (this.sharedMQTTClient) {
            this.sharedMQTTClient.addWhiteListTopic(stateTopic);
        }
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


    public override async onInit() {
        if (this.sharedMQTTClient) {
            await this.sharedMQTTClient.onInit(); // make sure sharedMQTTClient is initialized (will do nothing if it already is)
        }
        await this.mqtt.onInit();

        const rootTopic = makeV5BaseTopic(this.mqttOpts.topicRoot);

        this.mqtt.subscribe(`${rootTopic}/+/${HD_ATTR_STATE}`, undefined, true).pipe(takeUntil(this.onDestroy$)).subscribe({
            next: msg => {
                const { topic, payload, packet } = msg;

                const relTopic = topic.split(rootTopic + '/')[1];
                const [deviceId] = relTopic.split('/');

                if (payload.length === 0) { // device removal
                    this.nextEvent(<RemoveDiscoveryEvent>{ type: 'remove', deviceId: deviceId });
                    return;
                }
                this.nextEvent(<AddDiscoveryEvent>{
                    type: 'add', retained: packet.retain, deviceId,
                    makeDevice: () => this.makeDevice(deviceId)
                })
            },
            error: (err) => {
                this.log.error('Error in discovery loop. No new devices will be discovered: ', { error: err });
                this.nextEvent(<ErrorDiscoveryEvent>{ type: 'error', error: err });
            }
        });

    }

    public override async onDestroy() {
        try {
            await super.onDestroy();
            await this.mqtt.onDestroy();
            this.log.debug('mqtt connecition closed.');
        } catch (err) {
            this.log.error('Error closing mqtt connection: ', err);
        }
    }

    protected nextEvent(event: DiscoveryEvent) {
        this._discoveryEvents$.next(of(event));
    }


    public makeDevice(id: HomieID): HomieDevice {
        return new HomieDevice({ id }, this.sharedMQTTClient ? this.sharedMQTTClient : this.mqttOpts, HomieDeviceMode.Controller);
    }


}
