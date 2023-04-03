import { IClientPublishOptions } from "mqtt";
import { Observable } from "rxjs";
import { SimpleLogger } from "./misc";
import { HomieElementDescription, HomieElementPointer, HomieID, isHomieID, BaseAttributes } from "./model";
import { MqttMessage, MqttSubscription } from "./mqtt";
import { RXObject } from "./RXObject";

export abstract class HomieElement<T extends BaseAttributes, POINTER extends HomieElementPointer, DESC extends HomieElementDescription> extends RXObject<T> {
    protected readonly log: SimpleLogger;

    public abstract readonly topic: string;
    public abstract readonly pointer: POINTER;

    public get id(): HomieID {
        return this.attributes.id;
    }

    public override get attributes(): T {
        return this._attributes$.value;
    }

    protected override set attributes(value: T) {
        this.descriptionUpdateNeeded = true;
        super.attributes = value;
    }

    protected _isInitialized = false;
    public get isInitialized(): boolean { return this._isInitialized; }

    protected abstract set descriptionUpdateNeeded(value: boolean);

    constructor(
        attributes: T
    ) {
        super(attributes);
        this.log = new SimpleLogger(this.constructor.name, this.id);

        if (!isHomieID(this.id)) {
            throw new Error(`id (${this.id}) of homie object (${this.constructor.name}) has the wrong format!`);
        }

    }

    public abstract getDescription(): DESC;

    protected abstract mqttPublish$(path: string, value: string | null | undefined, options: IClientPublishOptions, publishEmpty: boolean): Observable<boolean>;

    public publish$(path: string, value: string | null | undefined, options: IClientPublishOptions = { retain: true, qos: 2 }, publishEmpty = false): Observable<boolean> {
        const p = (!!path && path.length > 0) ? `${this.id}/${path}` : `${this.id}`;
        return this.mqttPublish$(p, value, options, publishEmpty);

    }

    protected abstract mqttSubscribe(path: string, retained: boolean): Observable<MqttMessage>;

    public subscribe(path: string, retained: boolean = false): Observable<MqttMessage> {
        const p = (!!path && path.length > 0) ? `${this.id}/${path}` : `${this.id}`;
        return this.mqttSubscribe(p, retained);
    }

    // protected abstract mqttUnsubscribe(path: string): void;

    public abstract wipe$(): Observable<boolean>;

    // public unsubscribe(path: string) {
    //     const p = (!!path && path.length > 0) ? `${this.id}/${path}` : `${this.id}`;
    //     this.mqttUnsubscribe(p);
    // }

    public override async onDestroy(): Promise<void> {
        await super.onDestroy();
        this.log.silly(`destroying`);
    }
}
