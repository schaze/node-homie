import { HomieNode } from "./Node";
import {
    HomieDatatype,
    HomieDeviceMode,
    HomiePropertyAtrributes,
    HomiePropertyOptions,
    HomieValuesTypes,
} from "./model";
import { HomieItemBase } from "./homie-base";
import { BehaviorSubject, forkJoin, lastValueFrom, Observable, of, race, Subject, timer } from "rxjs";
import {
    defaultIfEmpty,
    distinctUntilChanged,
    filter,
    map,
    mapTo,
    pluck,
    skip,
    switchMap,
    switchMapTo,
    take,
    takeUntil,
    tap,
} from "rxjs/operators";
import { str2Hm } from "./util";
import { threadId } from "worker_threads";
import { MqttSubscription } from "./mqtt";

export const DEFAULT_VALUE_READ_TIMEOUT = 1000;
const PROP_ATTRS = ["$name", "$datatype", "$settable", "$retained", "$unit", "$format", "$tags"];

export interface OnSetEvent {
    property: HomieProperty;
    value: HomieValuesTypes;
    valueStr: string;
}

const DEFAULT_ATTRS = <HomiePropertyAtrributes>{
    settable: false,
    retained: true,
};

const DEFAULT_OPTIONS = <HomiePropertyOptions>{
    readValueFromMqtt: false,
    readTimeout: DEFAULT_VALUE_READ_TIMEOUT,
};

export class HomieProperty extends HomieItemBase<HomieNode, HomiePropertyAtrributes> {
    protected options: HomiePropertyOptions;

    // ===========================================================
    // =  Property value
    // ===========================================================

    protected _onSetMessage$ = new Subject<OnSetEvent>();
    public onSetMessage$ = this._onSetMessage$.asObservable();

    protected _value$ = new BehaviorSubject<string | undefined>(undefined);
    protected _valueObs$ = this._value$.asObservable();
    public readonly value$ = this.attributes$.pipe(
        // in connection with the retained attribute we return a observable with either
        // first value skipped (non-retained) or the normal behavioursubject with direct emission (retained)
        pluck("retained"),
        distinctUntilChanged(),
        switchMap((retained) => {
            if (retained) {
                return this._valueObs$;
            } else {
                return this._valueObs$.pipe(skip(1));
            }
        }),
    );
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

    public valueAsType$ = this.value$.pipe(map((value) => str2Hm(value, this.attributes.datatype)));
    public get valueAsType(): HomieValuesTypes {
        if (!this.attributes.retained) {
            return undefined;
        }
        return str2Hm(this.value, this.attributes.datatype);
    }

    public get node() {
        return this.parent;
    }

    public get device() {
        return this.node.device;
    }

    /**
     * Create a new Homie Property.
     * @constructor
     * @param  {HomieNode} node Parent node of the Property. The Property will be automatically added to the nodes property store.
     * @param  {HomiePropertyAtrributes} attrs Attributes of the property
     */
    constructor(node: HomieNode, attrs: HomiePropertyAtrributes, options: HomiePropertyOptions = DEFAULT_OPTIONS) {
        super(node, { ...DEFAULT_ATTRS, ...attrs });
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    protected override parseAttribute<T extends keyof HomiePropertyAtrributes>(
        name: T,
        rawValue: string,
    ): HomiePropertyAtrributes[T] {
        switch (name) {
            case "retained":
                return (rawValue === undefined ? true : rawValue === "true") as HomiePropertyAtrributes[T];
            case "settable":
                return (rawValue === "true") as HomiePropertyAtrributes[T];
            case "datatype":
                return rawValue as HomieDatatype as HomiePropertyAtrributes[T];
            case "format":
            case "unit":
            default:
                return super.parseAttribute(name, rawValue);
        }
    }

    public override async onInit() {
        if (this.isInitialized) {
            return;
        }
        await super.onInit();
        if (this.device.mode === HomieDeviceMode.Device) {
            if (this.options.readValueFromMqtt && this.attributes.retained) {
                this.log.debug("Attempt to read value from mqtt..");
                const v = await lastValueFrom(this.readValueFromMqtt$());
                this._value$.next(v);
            } else {
                await lastValueFrom(this.publishValue$());
            }
        }
        this._initialized = true;
    }

    public override wipe$(keepTags = true, keepMeta = true): Observable<boolean> {
        const pubs: Observable<boolean>[] = [];
        pubs.push(super.wipe$(keepTags, keepMeta));
        if (this.attributes.retained) {
            pubs.push(this.mqttPublish$(this.id, null, { retain: true, qos: 2 }, true));
        }
        return forkJoin(pubs).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
            map((results) => results.indexOf(false) === -1),
        );
    }

    protected readValueFromMqtt$(): Observable<string | undefined> {
        const valueReadSub = this.subscribe("");
        const valueRead$ = valueReadSub.messages$.pipe(
            takeUntil(this.onDestroy$),
            filter((msg) => msg.packet.retain),
            take(1),
            map((msg) => {
                const v = msg.payload.toString();
                this.log.debug(`Received [${v}]`);
                if (!this.validateValue(v)) {
                    return undefined;
                }
                return v;
            }),
        );
        valueReadSub.activate();
        return race(
            valueRead$,
            valueReadSub.active.pipe(
                filter((active) => active),
                take(1),
                switchMap((active) =>
                    timer(this.options.readTimeout || 0).pipe(
                        tap((msg) => {
                            this.log.debug(`${this.pointer} Timed out reading value from mqtt!`);
                        }),
                        mapTo(undefined),
                    ),
                ),
            ),
        );
    }

    public override subscribe_attrs(): string[] {
        return PROP_ATTRS;
    }
    public override subscribeTopics(): MqttSubscription[] {
        const subs = super.subscribeTopics();
        if (this.mode === HomieDeviceMode.Controller) {
            const valueSub = this.subscribe("");
            subs.push(valueSub);

            valueSub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: (msg) => {
                    const payload = msg.payload.toString();
                    // transform null and undefined values to empty strings
                    const value = payload === null || payload === undefined ? "" : payload;
                    this.setValue(value, false, false);
                },
                complete: () => {
                    this.unsubscribe("");
                },
            });
        } else if (this.mode === HomieDeviceMode.Device) {
            if (this.attributes.settable) {
                const setSub = this.subscribe("set");
                subs.push(setSub);

                setSub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
                    next: (msg) => {
                        this.log.info(`${this.topic} - Property SET command`);

                        const payload = msg.payload.toString();
                        // transform null and undefined values to empty strings
                        const value = payload === null || payload === undefined ? "" : payload;
                        this.onSetMessage(value);
                    },
                });
            }
        }
        return subs;
    }

    /**
     * Called when a set command is received via mqtt. Will emit a message on onSetMessage$.
     */
    public onSetMessage(value: string) {
        if (!this.validateValue(value)) {
            return;
        }
        this._onSetMessage$.next({
            property: this,
            valueStr: value,
            value: str2Hm(value, this.attributes.datatype),
        });
    }

    /** Publishes the current propery value to mqtt
     *  @param  {string} value Value to publish - if undefined, current value will be published
     */
    public publishValue$(value?: string, validate = true) {
        if (this.isInitialized) {
            const publishValue =
                (value === undefined || value === null) && this.attributes.retained ? this.value : value;

            if ((validate && this.validateValue(publishValue)) || !validate) {
                return this.mqttPublish$(this.id, publishValue, { retain: this.attributes.retained, qos: 2 }, true);
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
            if (!this.attributes.datatype) {
                return true;
            } // cannot validate for non datatype - so return true
            switch (this.attributes.datatype) {
                case "boolean":
                    return value === "true" || value === "false";
                case "integer":
                    return value !== undefined ? !isNaN(parseInt(value, 10)) : false;
                case "float":
                    return value !== undefined ? !isNaN(parseFloat(value)) : false;
                case "datetime":
                    // TODO
                    // new Date(value);
                    return true;
                case "duration":
                    // TODO
                    return true;
                case "enum":
                    if (value === undefined) {
                        return false;
                    }
                    if (!!this.attributes.format) {
                        return this.attributes.format.split(",").includes(value);
                    }
                    return true;
                default:
                    return value !== undefined;
            }
        } catch (err) {
            return false;
        }
    }

    public setValue(value: string | undefined | null, onlyIfChanged = false, validate = true) {
        if (value === undefined || value === null) {
            return;
        }

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
            this.publishValue$(value, false).subscribe();
        }
    }
}

