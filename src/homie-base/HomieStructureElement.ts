import { IClientPublishOptions } from "mqtt";
import { HomieBase } from "./HomieBase";
import { BaseAtrributes, HomieDeviceMode } from "../model";
import { Observable } from "rxjs";
import { MqttMessage, MqttSubscription } from "../mqtt";

export abstract class HomieStructureElement<
    TParent extends HomieBase<BaseAtrributes> | undefined,
    TAttributes extends BaseAtrributes>
    extends HomieBase<TAttributes>{

    public get topic(): string {
        return `${this.parent?.topic}/${this.id}`;
    }

    protected _initialized = false;
    public get isInitialized() {
        return this._initialized;
    }

    public get mode(): HomieDeviceMode {
        return this.parent!.mode;
    }

    private _parent: TParent;
    public get parent(): TParent { return this._parent; }



    constructor(parent: TParent, attrs: TAttributes) {
        super(attrs);
        this._parent = parent;
        this._pointer = this.parent ? `${this.parent.pointer}/${this.id}` : this.id;
    }


    protected mqttPublish$(path: string, value: string | null | undefined, options?: IClientPublishOptions, publishEmpty = false) {
        return this.parent!.publish$(path, value, options, publishEmpty);
    }

    protected mqttSubscribe(path: string): MqttSubscription {
        return this.parent!.subscribe(path);
    }

    protected mqttUnsubscribe(path: string) {
        this.parent!.unsubscribe(path);
    }

}