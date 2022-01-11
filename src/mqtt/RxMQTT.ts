
import { connect, IClientPublishOptions, IClientSubscribeOptions, IPublishPacket, MqttClient, Packet } from "mqtt";
import { BehaviorSubject, Observable, of, Subject } from "rxjs";
import { filter, takeUntil } from "rxjs/operators";
import { OnDestroy, OnInit } from "../misc";
import { SimpleLogger } from "../misc/Logger";
import { MQTTConnectOpts } from "../model";
import { mqttTopicMatch } from "../util";
import { Buffer } from 'buffer';

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


export class RxMqtt implements OnInit, OnDestroy {
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

    private subscriptions = new Map<string, MqttSubscription>();

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

    constructor(public readonly mqttOpts: MQTTConnectOpts) {
        this.log = new SimpleLogger(this.constructor.name, `${mqttOpts.url}`);
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

    public subscribe(topic: string, opts?: IClientSubscribeOptions): MqttSubscription {
        // if (!this.mqtt) { throw new Error('Subscribe before rxMqtt initialized!'); }
        // Try to avoid resubscribing for topics that are already covered by wildcard subscriptions
        // this can lead to duplicate messages for some brokers.
        // This will only cover specific topics without wildcards beeing subscribed to after a matching wildcard
        // subscription. If the specific topic was already subscribed before this wont work
        if (!topic.includes('#') && !topic.includes('+') && !this.subscriptions.has(topic)) {
            for (const [key, subs] of this.subscriptions.entries()) {
                if (mqttTopicMatch(key, topic)) {
                    // this.log.verbose(`Using existing subscription to ${key} for ${topic}`);
                    return { ...subs, messages$: subs.messages$.pipe(filter(msg => msg.topic === topic)) }
                }
            }
        }

        if (!this.subscriptions.has(topic)) {
            const active = new BehaviorSubject<boolean>(false);
            const unsubscribe = new Subject<boolean>();

            const subscription: MqttSubscription = {
                topic,
                active: active.asObservable(),
                activate: () => {
                    if (!this.mqtt) { throw new Error('Cannot activate subscribtion before rxMqtt is initialized!'); }
                    if (this.mqtt && !active.value) {
                        this.mqtt.subscribe(topic, opts !== undefined ? opts : { qos: 2 }, (error, granted) => {
                            if (!error) {
                                active.next(true);
                            }
                        });
                    }
                },
                messages$: this.onMessage$.pipe(takeUntil(unsubscribe), filter(event => mqttTopicMatch(topic, event.topic))),
                unsubscribe: () => {
                    this.mqtt?.unsubscribe(topic, undefined, (error, packet)=>{
                        if (!error) {
                            unsubscribe.next(true);
                            unsubscribe.complete();
                            active.next(false);
                            active.complete();
                        }
                    } )
                }
            }

            this.subscriptions.set(
                topic,
                subscription
            );
        }
        return this.subscriptions.get(topic)!;
    }

    private onMessage(topic: string, payload: Buffer, packet: IPublishPacket) {
        const event = { topic, payload, packet, topicTokens: topic.split('/') };
        this._onMessage$.next(event);
    }


    public unsubscribe(topic: string) {
        if (!this.mqtt) { return; }
       
        const sub = this.subscriptions.get(topic);
        if (!sub) { return; }

        
        sub.unsubscribe();
        this.subscriptions.delete(topic);
    }

    public unsubscribeAll() {
        for (const subTopic of this.subscriptions.keys()) {
            this.unsubscribe(subTopic);
        }
    }

    async onDestroy(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.unsubscribeAll();
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