import { HomieElement } from "./HomieElement";
import { HomieDevice } from "./HomieDevice";
import { HomieNode } from "./HomieNode";
import { PropertyPointer, PropertyAttributes, HomieValuesTypes, HomiePropertyOptions, HomieDeviceMode, PropertyDescription, ZERO_STRING } from "./model";
import { IClientPublishOptions } from "mqtt";
import { BehaviorSubject, distinctUntilChanged, filter, lastValueFrom, map, Observable, of, race, skip, Subject, switchMap, take, takeUntil, tap, timer } from "rxjs";
import { MqttMessage, MqttSubscription } from "./mqtt";
import { str2Hm } from "./util";

export const DEFAULT_VALUE_READ_TIMEOUT = 1000;
export interface OnSetEvent {
    property: HomieProperty;
    value: HomieValuesTypes;
    valueStr: string;
}


const DEFAULT_OPTIONS = <HomiePropertyOptions>{
    readValueFromMqtt: false,
    readTimeout: DEFAULT_VALUE_READ_TIMEOUT
}

const DEFAULT_ATTRIBUTES: Partial<PropertyAttributes> = {
    settable: false,
    retained: true
}



export class HomieProperty extends HomieElement<PropertyAttributes, PropertyPointer, PropertyDescription> {
    public readonly device: HomieDevice;
    public readonly topic: string;
    public readonly pointer: PropertyPointer;

    setsub!: MqttSubscription;

    protected set descriptionUpdateNeeded(value: boolean) {
        this.node.descriptionUpdateNeeded = value;
    }

    // ===========================================================
    // =  Property value
    // ===========================================================

    protected _onSetMessage$ = new Subject<OnSetEvent>();
    public onSetMessage$ = this._onSetMessage$.asObservable();

    protected _value$ = new BehaviorSubject<string | undefined>(undefined);
    protected _valueObs$ = this._value$.asObservable();
    public readonly value$ = this.attributes$.pipe( // in connection with the retained attribute we return a observable with either 
        // first value skipped (non-retained) or the normal behavioursubject with direct emission (retained)
        map(attrs => attrs.retained),
        distinctUntilChanged(),
        switchMap(retained => {
            if (retained) {
                return this._valueObs$;
            } else {
                return this._valueObs$.pipe(skip(1));
            }
        })
    )
    //: Observable<string>;

    public get value(): string | undefined {
        if (!this.attributes.retained) {
            return undefined;
        }
        return this._value$.value;
    }

    public set value(val: string | undefined) {
        this.setValue(val);
    }

    public valueAsType$ = this.value$.pipe(map(value => str2Hm(value, this.attributes.datatype)))
    public get valueAsType(): HomieValuesTypes {
        if (!this.attributes.retained) {
            return undefined;
        }
        return str2Hm(this.value, this.attributes.datatype);
    }

    public get mode(): HomieDeviceMode {
        return this.device.mode;
    }


    constructor(
        public readonly node: HomieNode,
        attributes: PropertyAttributes,
        protected options: HomiePropertyOptions = DEFAULT_OPTIONS
    ) {
        super({ ...DEFAULT_ATTRIBUTES, ...attributes });
        this.device = node.device;

        this.topic = `${node.topic}/${this.id}`;
        this.pointer = `${node.pointer}/${this.id}`;
    }

    public getDescription(): PropertyDescription {
        const { retained, settable, id, ...rest } = this.attributes;
        return {
            ...rest,
            retained: retained === DEFAULT_ATTRIBUTES.retained ? undefined : false, // omit retained if it has the default value
            settable: settable === DEFAULT_ATTRIBUTES.settable ? undefined : true // omit settable if it has the default value
        }
    }

    public override async onInit() {
        if (this.isInitialized) { return; }
        this.subscribeTopics();


        if (this.mode === HomieDeviceMode.Device) {
            if (this.options.readValueFromMqtt && this.attributes.retained) {
                this.log.debug('Attempt to read value from mqtt..');
                const v = await lastValueFrom(this.readValueFromMqtt$());
                this._value$.next(v);
                this._isInitialized = true
            } else {
                this._isInitialized = true
                await lastValueFrom(this.publishValue$());
            }
        } else {
            this._isInitialized = true
        }
    }

    protected readValueFromMqtt$(): Observable<string | undefined> {
        // const valueReadSub = this.subscribe('');
        const valueRead$ = this.subscribe('', this.attributes.retained).pipe(
            takeUntil(this.onDestroy$),
            filter(msg => msg.packet.retain),
            take(1),
            map(msg => {
                const v = msg.payload.toString();
                this.log.debug(`Received [${v}]`);
                if (!this.validateValue(v)) { return undefined; }
                return v;
            }),

        );
        // valueReadSub.activate();
        return race(
            valueRead$,
            // this.device.c
            // valueReadSub.active.pipe(
            //     filter(active => active),
            //     take(1),
            //     switchMap(_ => timer(this.options.readTimeout || 0).pipe(
            //         tap(_ => { this.log.debug('Timed out reading value from mqtt!'); }),
            //         map(_ => undefined))))
        );
    }

    protected subscribeTopics() {
        if (this.mode === HomieDeviceMode.Controller) {
            const valueSub = this.subscribe('').pipe(takeUntil(this.onDestroy$)).subscribe({
                next: msg => {
                    const payload = msg.payload.toString();
                    // transform null and undefined values to empty strings
                    const value = (payload === null || payload === undefined) ? "" : payload;
                    this.setValue(value, false, false);
                }
            });
        } else if (this.mode === HomieDeviceMode.Device) {
            if (this.attributes.settable) {
                const setSub = this.subscribe('set').pipe(
                    takeUntil(this.onDestroy$)
                ).subscribe({
                    next: msg => {
                        this.log.verbose(`${this.topic} - Property SET command`);

                        const payload = msg.payload.toString();
                        // transform null and undefined values to empty strings
                        const value = (payload === null || payload === undefined) ? "" : payload;
                        this.onSetMessage(value);
                    }
                });
            }
        }
    }

    /** 
     * Called when a set command is received via mqtt. Will emit a message on onSetMessage$.
     */
    public onSetMessage(value: string) {
        if (!this.validateValue(value)) { return; }
        this._onSetMessage$.next({
            property: this,
            valueStr: value,
            value: str2Hm(value, this.attributes.datatype)
        })
    }

    /** Publishes the current propery value to mqtt 
     *  @param  {string} value Value to publish - if undefined, current value will be published
    */
    public publishValue$(value?: string, validate = true) {
        if (this.isInitialized) {
            const publishValue = ((value === undefined || value === null) && this.attributes.retained) ? this.value : value;

            if ((validate && this.validateValue(publishValue)) || !validate) {
                this.log.verbose(`Publishing ${publishValue}`);
                return this.publish$('', publishValue === "" ? ZERO_STRING : publishValue, { retain: this.attributes.retained, qos: 2 }, true);
            }
        }
        return of(true);
    }

    /**
     * Publishes a /set mqtt message.
     * @param  {string} value Set value of property
     */
    public setCommand$(value: string) {
        if (this.isInitialized && this.attributes.settable && this.validateValue(value)) {
            return this.publish$(`set`, value, { retain: false, qos: 2 }, true);
        }
        return of(true); // this should probably be false!
    }

    private validateValue(value: string | undefined): boolean {
        try {
            if (!this.attributes.datatype) { return true; } // cannot validate for non datatype - so return true
            switch (this.attributes.datatype) {
                case 'boolean':
                    return value === 'true' || value === 'false';
                case 'integer':
                    return value !== undefined ? !isNaN(parseInt(value, 10)) : false;
                case 'float':
                    return value !== undefined ? !isNaN(parseFloat(value)) : false;;
                case 'datetime':
                    // TODO
                    // new Date(value);
                    return true;
                case 'duration':
                    // TODO
                    return true;
                case 'enum':
                    if (value === undefined) { return false; }
                    if (!!this.attributes.format) {
                        return this.attributes.format.split(',').includes(value);
                    }
                    return true;
                default:
                    return value !== undefined;
            }
        } catch (err) {
            return false;
        }
    }

    public async setValue(value: string | undefined | null, onlyIfChanged = false, validate = true) {
        if (value === undefined || value === null) { return; }

        if (onlyIfChanged && this.attributes.retained && value === this.value) {
            return;
        }

        if (validate) {
            if (!this.validateValue(value)) {
                return;
            }
        }
        this._value$.next(value);
        if (this.mode === HomieDeviceMode.Device) {

            await lastValueFrom(this.publishValue$(value, false));
        }
    }






    protected mqttPublish$(path: string, value: string | null | undefined, options: IClientPublishOptions, publishEmpty: boolean): Observable<boolean> {
        return this.node.publish$(path, value, options, publishEmpty);
    }
    protected mqttSubscribe(path: string, retained: boolean = false): Observable<MqttMessage> {
        return this.node.subscribe(path, retained);
    }

    public override wipe$(): Observable<boolean> {
        if (this.isInitialized && this.attributes.retained) {
            return this.mqttPublish$(this.id, null, { retain: true, qos: 2 }, true);
        }
        return of(true);
    }

}