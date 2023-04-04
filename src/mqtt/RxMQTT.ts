
import { connect, IClientPublishOptions, IClientSubscribeOptions, IPublishPacket, ISubscriptionGrant, MqttClient, Packet } from "mqtt";
import { BehaviorSubject, merge, Observable, ReplaySubject, Subject, Subscription, Unsubscribable, using } from "rxjs";
import { filter, share,takeUntil } from "rxjs/operators";
import { LifecycleBase } from "../misc";
import { SimpleLogger } from "../misc/Logger";
import { MQTTConnectOpts } from "../model";
import { isMqttWildcardTopic, mqttTopicMatch } from "../util";
import { Buffer } from 'buffer';
import { MqttReplaySubject } from "./MqttReplaySubject";

const empty = Buffer.allocUnsafe(0);


export interface MqttMessage {
    topic: string;
    topicTokens: string[];
    payload: Buffer;
    packet: IPublishPacket;
}


export interface MqttConnectionInfo {
    connected: boolean;
    disconnecting: boolean;
    disconnected: boolean;
    reconnecting: boolean;
}

export interface MqttSubscription {
    topic: string;
    activate: () => void;
    messages$: Observable<MqttMessage>;
    active: Observable<boolean>;
    unsubscribe: () => void;
}




export class RxMqtt extends LifecycleBase {
    static counter = 0;
    protected readonly log: SimpleLogger;
    protected mqtt: MqttClient | undefined;

    private _onConnect$ = new Subject<boolean>();
    onConnect$ = this._onConnect$.asObservable();

    private _onDisconnect$ = new Subject<boolean>();
    onDisconnect$ = this._onDisconnect$.asObservable();

    private _onReconnect$ = new Subject<boolean>();
    onReconnect$ = this._onReconnect$.asObservable();

    private _onError$ = new Subject<Error>();
    onError$ = this._onError$.asObservable();

    private _onOffline$ = new Subject<boolean>();
    onOffline$ = this._onOffline$.asObservable();

    private _onMessage$ = new Subject<MqttMessage>();
    onMessage$ = this._onMessage$.asObservable();

    private observables = new Map<string, Observable<MqttMessage>>();

    private activateOnConnect: (() => void)[] = [];

    public get disconnecting(): boolean {
        return this.mqtt ? this.mqtt.disconnecting : false;
    }

    private _connectionInfo$ = new BehaviorSubject<MqttConnectionInfo>({
        connected: false,
        disconnected: true,
        disconnecting: false,
        reconnecting: false
    });
    public connectionInfo$ = this._connectionInfo$.asObservable();
    public get connectionInfo() {
        return this._connectionInfo$.value;
    }

    constructor(
        public readonly mqttOpts: MQTTConnectOpts
    ) {
        super();
        this.log = new SimpleLogger(this.constructor.name, `instance-${RxMqtt.counter}`);
        RxMqtt.counter++;
    }

    async onInit(): Promise<void> {
        if (this.mqtt) { return; }
        return new Promise((resolve, reject) => {
            try {
                const onError = (err: Error) => {
                    this.updateConnectionInfo();
                    if (!this.disconnecting) {
                        reject(err);
                    }
                }
                const onConnect = () => {
                    this.updateConnectionInfo();
                    if (this.mqtt) {
                        this.activateOnConnect.forEach(activate => {
                            activate();
                        });
                        this.activateOnConnect = [];
                        this.mqtt.removeListener('conect', onConnect);
                        this.mqtt.removeListener('error', onError);
                    }
                    resolve();
                }

                this.mqtt = connect(this.mqttOpts.url, {
                    username: this.mqttOpts.username,
                    password: this.mqttOpts.password,
                    properties: {
                        receiveMaximum: 100000
                    },
                    reconnectPeriod: this.mqttOpts.reconnectPeriod ? this.mqttOpts.reconnectPeriod : 5000,
                    will: this.mqttOpts.will,
                });


                this.mqtt.on('message', this.onMessage.bind(this));
                this.mqtt.on('connect', this.onConnect.bind(this));
                this.mqtt.on('error', this.onError.bind(this));
                this.mqtt.on('reconnect', this.onReconnect.bind(this));
                this.mqtt.on('disconnect', this.onDisconnect.bind(this));
                this.mqtt.on('close', this.onClose.bind(this));
                this.mqtt.on('offline', this.onOffline.bind(this));
                this.mqtt.on('end', this.onEnd.bind(this));

                this.mqtt.on('connect', onConnect);
                this.mqtt.on('error', onError);
            } catch (err) {
                reject(err);
            }
        })
    }

    protected onConnect() {
        this.updateConnectionInfo();
        this._onConnect$.next(true);
    }

    protected onError(error: Error) {
        this.updateConnectionInfo();
        this._onError$.next(error)
    }

    protected onOffline() {
        this.updateConnectionInfo();
        this._onOffline$.next(true)
    }

    protected onReconnect() {
        this.updateConnectionInfo();
        this._onReconnect$.next(true);
    }

    protected onClose() {
        this.updateConnectionInfo();
    }

    protected onDisconnect() {
        this.updateConnectionInfo();
        this._onDisconnect$.next(true)
    }

    protected onEnd() {
        this.updateConnectionInfo();
    }

    protected updateConnectionInfo() {
        if (!this.mqtt) { return; }
        const ci = { ... this.connectionInfo };

        if (ci.connected !== this.mqtt.connected ||
            ci.disconnected !== this.mqtt.disconnected ||
            ci.disconnecting !== this.mqtt.disconnecting ||
            ci.reconnecting !== this.mqtt.reconnecting) {

            this._connectionInfo$.next({
                connected: this.mqtt.connected,
                disconnected: this.mqtt.disconnected,
                disconnecting: this.mqtt.disconnecting,
                reconnecting: this.mqtt.reconnecting
            });

        }
    }

    public publish(topic: string, message: string | Buffer | null | undefined, opts?: IClientPublishOptions) {
        if (!this.mqtt) { return; }
        this.mqtt.publish(topic, message ? message : empty, opts !== undefined ? opts : {});
    }

    public publish$(topic: string, message: string | Buffer | null | undefined, opts?: IClientPublishOptions): Observable<Packet> {
        if (!this.mqtt) { throw new Error('Publish before rxMqtt initialized!'); }
        return new Observable(subscriber => {
            this.mqtt!.publish(topic, message ? message : empty, opts !== undefined ? opts : {}, (error, packet) => {
                if (!error) {
                    subscriber.next(packet);
                } else {
                    subscriber.error(error);
                }
                subscriber.complete();
            });
        })

    }

    /**
     * Subscribe to a mqtt topic and return an observable of messages.
     * When the last Observable subscriber unsubscribes the mqtt topic will be unsubscribed as well.
     * 
     * @param topic mqtt topic to be subscribed to.
     * @param retained wether to treat the messages from this subscription as retained. MQTT subscriptions are kept to a minimum and no same topic will be subsribed to more than once. 
     * This is due to problems with some brokers (e.g. vernemq, nanomq) which will send all messages as many times as there are subscriptions even for the same topic.
     * Due to this a 2nd, 3rd,... Observable subscriber to the same topic would never receive the retained messages from the server as these we sent only once in the beginning.
     * When setting retained to true all these messages will be buffered in order and only once per topic and re-emitted for every "late" subscriber. Please note that this
     * is also true for messages that were sent to the server without the retained message flag!
     * @param opts subscription options, will default to {qos: 2}
     * @returns An observable of messages.
     */
    public subscribe(topic: string, retained: boolean = false, opts: IClientSubscribeOptions = { qos: 2 }): Observable<MqttMessage> {
        if (!this.observables.has(topic)) {
            // Try to avoid resubscribing for topics that are already covered by wildcard subscriptions
            // this can lead to duplicate messages for some brokers.
            // This will only cover more specific (wildcard-) topics  beeing subscribed to after a matching less specific wildcard
            // subscription. If the specific topic was already subscribed before this wont work
            for (const [key, subs] of this.observables.entries()) {
                if (mqttTopicMatch(key, topic)) {
                    return subs.pipe(filter(msg => mqttTopicMatch(topic, msg.topic)));
                }
            }

            const rejected$ = new Subject<MqttMessage>();

            const unsubscribe = (_topic: string = topic) => {
                this.observables.delete(_topic);
                this.mqtt?.unsubscribe(_topic);
            }

            const activate = () => {
                this.mqtt?.subscribe(topic, opts !== undefined ? opts : { qos: 2 }, (error, granted: ISubscriptionGrant[]) => {
                    if (granted) { // granted can be undefined when an error occurs when the client is disconnecting
                        granted.forEach((granted_: ISubscriptionGrant) => {
                            if (granted_.qos === 128) {
                                unsubscribe(granted_.topic)
                                rejected$.error(`subscription for '${granted_.topic}' rejected!`);
                            }
                        });
                    }
                });
            };



            const msgs$ = using(
                () => {
                    const subscription: Subscription = new Subscription();
                    // support subscriptions before mqtt connection is established.
                    if (!this.mqtt) {
                        this.activateOnConnect.push(activate);
                    } else {
                        activate();
                    }
                    subscription.add(() => {
                        unsubscribe();
                    });
                    return subscription;

                },
                (subscription: Unsubscribable | void) => merge(rejected$, this.onMessage$)).pipe(
                    filter((msg: MqttMessage) => mqttTopicMatch(topic, msg.topic)),
                    retained ? share(
                        {
                            connector: () => isMqttWildcardTopic(topic) ? new MqttReplaySubject() : new ReplaySubject(1),
                            resetOnError: true,
                            resetOnComplete: false,
                            resetOnRefCountZero: true
                        }

                    ) : share(),
                    takeUntil(this.onDestroy$),
                );

            this.observables.set(topic, msgs$);
        }
        return this.observables.get(topic)!

    }

    private onMessage(topic: string, payload: Buffer, packet: IPublishPacket) {
        const msg = { topic, payload, packet, topicTokens: topic.split('/') };
        this._onMessage$.next(msg);
    }


    override async onDestroy(): Promise<void> {
        await super.onDestroy();
        return new Promise((resolve, reject) => {
            try {
                // this.unsubscribeAll();
                this._onMessage$.complete();
                const cleanup = () => {
                    this._onConnect$.complete();
                    this._onDisconnect$.complete();
                    this._onOffline$.complete();
                    this._onError$.complete();
                    this._onMessage$.complete();
                    this._connectionInfo$.complete();
                    this._onReconnect$.complete();
                    resolve();
                }
                this.mqtt ? this.mqtt.end(false, {}, () => cleanup()) : cleanup();
            } catch (err) {
                reject(err);
            }
        })
    }


}