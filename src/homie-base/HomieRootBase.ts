import { IClientPublishOptions } from "mqtt";
import { HomieItemBase } from "./HomieItemBase";
import { BaseItemAtrributes, HomieDeviceMode, MQTTConnectOpts } from "../model";
import { MqttConnectionInfo, MqttMessage, MqttSubscription, RxMqtt } from "../mqtt";
import { Observable, of } from "rxjs";
import { catchError, mapTo } from "rxjs/operators";


export abstract class HomieRootBase<TAttributes extends BaseItemAtrributes> extends HomieItemBase<undefined, TAttributes> {

    public override get topic(): string {
        return `${this.mqttOpts?.topicRoot}/${this.id}`;
    }

    protected _mode: HomieDeviceMode = HomieDeviceMode.Device;
    public override get mode(): HomieDeviceMode {
        return this._mode;
    }

    protected mqtt: RxMqtt;
    protected mqttOpts: MQTTConnectOpts;

    protected subscriptions = new Map<string, MqttSubscription>();

    public get connectionInfo$() {
        return this.mqtt?.connectionInfo$;
    }
    public get connectionInfo() {
        return this.mqtt?.connectionInfo;
    }

    protected _isInitialized = false;
    public override get isInitialized(): boolean { return this._isInitialized; }


    constructor(attrs: TAttributes, mqttOptions: MQTTConnectOpts | RxMqtt, mode: HomieDeviceMode = HomieDeviceMode.Device) {
        super(undefined, attrs);
        this._pointer = this.id;
        this._mode = mode;
        if (mqttOptions instanceof RxMqtt) {
            this.mqttOpts = { ...mqttOptions.mqttOpts };
        } else {
            this.mqttOpts = { ...mqttOptions };
        }

        if (!this.mqttOpts.topicRoot) { this.mqttOpts.topicRoot = 'homie'; }
        this.mqtt = ((mqttOptions instanceof RxMqtt) && (this.mode === HomieDeviceMode.Controller)) ? mqttOptions : new RxMqtt(this.mqttOpts);

    }

    public override async onInit(): Promise<void> {
        // cancel out onInit upwards chaining, root device needs to handle its initialization completly on its own.
    }

    protected override mqttPublish$(path: string, value: string | null | undefined, options?: IClientPublishOptions, publishEmpty = false): Observable<boolean> {
        if (!this.isInitialized) { throw new Error('Trying to publish while not initialized!'); } // return of(false) instead of throwing error?
        if (!publishEmpty && (value === undefined || value === null || value === '')) { return of(true); }
        this.log.silly(`Publishing ${path} -> ${value}  | options: ${options}`);
        return this.mqtt.publish$(`${this.mqttOpts.topicRoot}/${path}`, (value === '' || value === undefined) ? null : value, options).pipe(
            mapTo(true),
            catchError(err => of(false))
        )
    }


    protected override mqttSubscribe(path: string): MqttSubscription {
        const topic =`${this.mqttOpts.topicRoot}/${path}`;
        return this.mqtt.subscribe(topic, { qos: 2, rh: 0 });
    }

    protected override mqttUnsubscribe(path: string) {
        this.mqtt.unsubscribe(`${this.mqttOpts.topicRoot}/${path}`);
    }

    public onError(err: Error): void {

    }

}