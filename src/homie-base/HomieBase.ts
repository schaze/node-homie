import { IClientPublishOptions, Packet } from "mqtt";
import { BaseAtrributes, HomieDeviceMode, DevicePointer, HomieID } from "../model";
import { BehaviorSubject, forkJoin, merge, Observable, of, Subject } from "rxjs";
import { OnDestroy, OnInit } from "../misc";
import { MqttMessage, MqttSubscription } from "../mqtt";
import { defaultIfEmpty, map, mapTo } from "rxjs/operators";
import { SimpleLogger } from "../misc/Logger";


export abstract class HomieBase<TAttributes extends BaseAtrributes> implements OnInit, OnDestroy {
    protected readonly log: SimpleLogger;

    // ===========================================================
    // =  Lifecycle Mgmt
    // ===========================================================

    protected _onDestroy$ = new Subject<boolean>();
    public onDestroy$ = this._onDestroy$.asObservable();


    // ===========================================================
    // =  Attributes 
    // ===========================================================
    protected _attributes$: BehaviorSubject<TAttributes>;
    // = new BehaviorSubject<TAttributes | undefined>(undefined);
    public attributes$: Observable<TAttributes>;
    public get attributes(): TAttributes {
        return this._attributes$.value;
    }

    public get id(): HomieID {
        return this._attributes$.value.id
    }

    // ===========================================================
    // =  MQTT related 
    // ===========================================================
    public abstract get topic(): string;
    public abstract get mode(): HomieDeviceMode;

    public abstract get isInitialized(): boolean;

    // ===========================================================
    // =  General
    // ===========================================================
    protected _pointer!: DevicePointer;
    /** 
    * Pointer relative to the homie base topic to the property(equeals { deviceId }/{nodeId}/{ properyId }) 
    */
    public get pointer(): DevicePointer {
        return this._pointer;
    }

    constructor(attrs: TAttributes) {
        this.log = new SimpleLogger(this.constructor.name, attrs.id);
        this.assertValidId(attrs.id);
        this._attributes$ = new BehaviorSubject(attrs);
        this.attributes$ = this._attributes$.asObservable();

    }


    // ===========================================================
    // =  Attributes 
    // ===========================================================
    protected parseAttribute<T extends keyof TAttributes>(name: T, rawValue: string): TAttributes[T] {
        switch (name) {
            case 'id':
            default:
                return rawValue as unknown as TAttributes[T];
        }
    }


    public setAttribute<T extends keyof TAttributes>(name: T, value: TAttributes[T] | null | undefined, onlyIfChanged = true) {
        if (onlyIfChanged && this.attributes[name] === value) { return; }
        this._attributes$.next({ ...this.attributes, [name]: value });
    }

    public setAttributes(attrs: Partial<TAttributes>) {
        this._attributes$.next({ ...this.attributes, ...attrs as TAttributes });
    }

    protected assertValidId(id: string) {
        // TODO: Implement if format checking according to spec ([a-z][0-9]- and !^-)
        //
        return;
    }


    // ===========================================================
    // =  MQTT related 
    // ===========================================================
    // protected abstract mqttPublish(path: string, value: string, options: IClientPublishOptions, wipe: boolean);

    // public publish(path: string, value: string, options: IClientPublishOptions = { retain: true, qos: 2 }, wipe = false) {
    //     this.mqttPublish(`${this.id}/${path}`, value, options, wipe);
    // }

    protected abstract mqttPublish$(path: string, value: string | null | undefined, options: IClientPublishOptions, publishEmpty: boolean): Observable<boolean>;

    public publish$(path: string, value: string | null | undefined, options: IClientPublishOptions = { retain: true, qos: 2 }, publishEmpty = false): Observable<boolean> {
        return this.mqttPublish$(`${this.id}/${path}`, value, options, publishEmpty);
    }

    protected abstract mqttSubscribe(path: string): MqttSubscription;

    public subscribe(path: string): MqttSubscription {
        if (!!path && path.length > 0) {
            return this.mqttSubscribe(`${this.id}/${path}`);
        } else {
            return this.mqttSubscribe(`${this.id}`);
        }
    }

    protected abstract mqttUnsubscribe(path: string): void;

    public unsubscribe(path: string) {
        this.mqttUnsubscribe(`${this.id}/${path}`);
    }

    public publishAttribute$<T extends keyof TAttributes>(name: T, value?: TAttributes[T]): Observable<boolean> {
        if (value === undefined && this.attributes[name] === undefined) { return of(true); }
        const pubValue = value !== undefined ? String(value) : String(this.attributes[name])
        this.log.silly(`publish attribute: ${name} => ${pubValue}`);
        return this.publish$('$' + name, pubValue);
    }

    public publishAttributes$(attributes?: TAttributes): Observable<boolean> {
        if (attributes === undefined || attributes === null) {
            return this.publishAttributes$(this.attributes);
        }
        return forkJoin(
            Object.keys(attributes).map(attrName => {
                if (attrName === 'id') { return of(true); }

                const attrValue = attributes[attrName as keyof TAttributes];
                if (attrValue !== undefined && attrValue !== null) {
                    return this.publishAttribute$(attrName as keyof TAttributes, attrValue);
                }else {
                    return of(true);
                }
            })).pipe(
                defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
                map(results => results.indexOf(false) === -1)
            );
    }


    // rx wipe
    // ==========================

    public wipeAttribute$<T extends keyof TAttributes>(name: T): Observable<boolean> {
        return this.publish$('$' + name, null, { retain: true, qos: 2 }, true);
    }

    public wipeAttributes$(attributes?: TAttributes): Observable<boolean> {
        if (attributes === undefined || attributes === null) {
            return this.wipeAttributes$(this.attributes);
        }
        return forkJoin(
            Object.keys(this.attributes).map(attrName => {
                if (attrName === 'id') { return of(true); }

                return this.wipeAttribute$(attrName as keyof TAttributes);
            })).pipe(
                defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
                map(results => results.indexOf(false) === -1)
            );
    }

    public wipe$(): Observable<boolean> {
        if (this.isInitialized) {
            return this.wipeAttributes$();
        }
        return of(true);
    }


    // ===========================================================
    // =  Lifecycle Mgmt
    // ===========================================================
    abstract onInit(): Promise<void>;

    public async onDestroy() {
        this._onDestroy$.next(true);
    }

}