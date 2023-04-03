
import { connect, IClientPublishOptions, IClientSubscribeOptions, IPublishPacket, ISubscriptionGrant, MqttClient, Packet } from "mqtt";
import { BehaviorSubject, concat, from, merge, Observable, of, Subject, Subscription, Unsubscribable, using } from "rxjs";
import { filter, refCount, share, shareReplay, switchMap, takeUntil } from "rxjs/operators";
import { LifecycleBase, OnDestroy, OnInit } from "../misc";
import { SimpleLogger } from "../misc/Logger";
import { MQTTConnectOpts, ObjectMap } from "../model";
import { isMqttWildcardTopic, mqttTopicMatch } from "../util";
import { Buffer } from 'buffer';

const empty = Buffer.allocUnsafe(0);

export interface ReplaySettings {
    whiteListTopics: string[];
}


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
    protected replayBuffer = <ObjectMap<string, MqttMessage>>{};

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
        public readonly mqttOpts: MQTTConnectOpts,
        protected replaySettings?: ReplaySettings
    ) {
        super();
        this.log = new SimpleLogger(this.constructor.name, `instance-${RxMqtt.counter}`);
        RxMqtt.counter++;
        this.log.info(`Amount of RxMqtt Clients: ${RxMqtt.counter}`);
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
                        this.activateOnConnect=[];
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

    public subscribe(topic: string, opts?: IClientSubscribeOptions, retained: boolean = false): Observable<MqttMessage> {
        this.log.debug(`Subscribing to ${topic}`);

        // Try to avoid resubscribing for topics that are already covered by wildcard subscriptions
        // this can lead to duplicate messages for some brokers.
        // This will only cover specific topics without wildcards beeing subscribed to after a matching wildcard
        // subscription. If the specific topic was already subscribed before this wont work
        if (!isMqttWildcardTopic(topic) && !this.observables.has(topic)) {
            for (const [key, subs] of this.observables.entries()) {
                if (mqttTopicMatch(key, topic)) {
                    // this.log.info(`Using existing subscription to ${key} for ${topic} -- subscription amount ${this.subscriptions.size}`);
                    return subs.pipe(filter(msg => msg.topic === topic));
                }
            }
        }
        if (!this.observables.has(topic)) {
            const unsubscribe$ = new Subject<boolean>();
            const rejected$ = new Subject<MqttMessage>();

            const unsubscribe = (_topic: string = topic) => {
                this.observables.delete(_topic);
                this.mqtt?.unsubscribe(_topic);
                this.log.debug(`Unsubcribed from ${topic}`);
            }

            const activate = () => {
                this.log.debug(`Activating subscription to ${topic}`);
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



            const msgs$ = using<Observable<MqttMessage>>(
                () => {
                    const subscription: Subscription = new Subscription();
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
                (subscription: Unsubscribable | void) =>
                    concat(
                        of(null).pipe(switchMap(_ => {
                            if (!retained) {
                                return from(<MqttMessage[]>[])
                            }
                            const buffered = this.getMessagesFromBuffer(topic);
                            return from(buffered);
                        })),
                        merge(rejected$, this.onMessage$)
                    ).pipe(
                        filter((msg: MqttMessage) => mqttTopicMatch(topic, msg.topic)),
                        takeUntil(this.onDestroy$),
                        retained ? shareReplay(1) : share()
                    )
            );

            this.observables.set(topic, msgs$);
        }
        return this.observables.get(topic)!;
    }

    protected inWhiteList(topic: string, whiteList: string[]): boolean {
        for (let index = 0; index < whiteList.length; index++) {
            const whiteListTopic = whiteList[index];
            if (mqttTopicMatch(whiteListTopic, topic)) {
                return true;
            }
        }
        return false;
    }

    protected getMessagesFromBuffer(topic: string): MqttMessage[] {
        if (!this.replaySettings) { return []; }
        const result: MqttMessage[] = [];

        if (!isMqttWildcardTopic(topic)) {
            const bufferedMessage = this.replayBuffer[topic];
            if (bufferedMessage) {
                result.push(bufferedMessage);
                return result
            } else {
                return [];
            }
        }

        const bufferTopics = Object.keys(this.replayBuffer);
        for (let index = 0; index < bufferTopics.length; index++) {
            const bufferTopic = bufferTopics[index];
            if (mqttTopicMatch(topic, bufferTopic)) {
                result.push(this.replayBuffer[bufferTopic])
            }

        }
        return result;
    }

    private onMessage(topic: string, payload: Buffer, packet: IPublishPacket) {
        const msg = { topic, payload, packet, topicTokens: topic.split('/') };
        this.log.debug(`msg ${topic} --> [${packet.messageId}]`, { topics: (<any>this.mqtt)._messageIdToTopic })
        if (this.replaySettings) {
            if (this.inWhiteList(msg.topic, this.replaySettings.whiteListTopics)) {
                if (msg.payload.length > 0) {
                    this.replayBuffer[msg.topic] = msg;
                } else {
                    delete this.replayBuffer[msg.topic];
                }
            }
        }
        this._onMessage$.next(msg);
    }

    public addWhiteListTopic(topic: string) {
        if (!this.replaySettings) {
            this.replaySettings = { whiteListTopics: [topic] }
        } else {
            if (!this.replaySettings.whiteListTopics.includes(topic)) {
                this.replaySettings.whiteListTopics.push(topic);
            }
        }
    }

    public removeWhiteListTopic(topic: string) {
        if (!this.replaySettings) {
            return;
        }
        const index = this.replaySettings.whiteListTopics.indexOf(topic);
        if (index >= 0) {
            this.replaySettings.whiteListTopics.splice(index, 1);
        }

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