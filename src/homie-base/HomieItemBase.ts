// import { makeDebug } from "../../lib/Debug";
import { BaseAtrributes, BaseItemAtrributes, HomieDeviceMode } from "../model";
import { HomieBase } from "./HomieBase";
import { HomieStructureElement } from "./HomieStructureElement";
import { defaultIfEmpty, distinctUntilChanged, filter, map, mapTo, takeUntil, tap } from "rxjs/operators";
import { parseCSVString } from "../util";
import { Meta, H_ATTR_META } from "./Meta";
import { Tags } from "./Tags";
import { forkJoin, lastValueFrom, Observable, of } from "rxjs";
import { MqttSubscription } from "../mqtt";

const H_ATTR_TAGS = '$tags';
export class HomieItemBase<
    TParent extends HomieBase<BaseAtrributes> | undefined,
    TAttributes extends BaseItemAtrributes> extends HomieStructureElement<TParent, TAttributes> {


    public tags: Tags<TParent, TAttributes>; //= new Tags(this);
    public meta: Meta<TParent, TAttributes>; // = new Meta(this);

    constructor(parent: TParent, attrs: TAttributes) {
        super(parent, attrs);
        this.tags = new Tags(this);
        this.meta = new Meta(this);
        if (attrs.tags === undefined) { this.tags.setTags([]) }
        if (attrs.meta === undefined) { this.meta.setMeta([]) }
    }

    protected override parseAttribute<T extends keyof TAttributes>(name: T, rawValue: string): TAttributes[T] {
        switch (name) {
            case 'name':
            default:
                return super.parseAttribute(name, rawValue);
        }
    }

    public override publishAttribute$<T extends keyof TAttributes>(name: T, value?: TAttributes[T]): Observable<boolean> {
        if (name != 'meta') {
            return super.publishAttribute$(name, value);
        }
        this.log.silly(`publish attribute: ${name} => ${value}`);
        return this.meta.publish$(value as TAttributes['meta']);
    }



    // rx wipe
    // ==========================

    public override wipeAttributes$(attributes?: TAttributes, keepTags = true, keepMeta = true): Observable<boolean> {
        if (attributes === undefined || attributes === null) {
            return this.wipeAttributes$(this.attributes);
        }
        return forkJoin(
            Object.keys(this.attributes).map(attrName => {
                if (attrName !== 'id' && attrName !== 'tags' && attrName !== 'meta') {
                    return this.wipeAttribute$(attrName as keyof TAttributes)
                }
                if (!keepTags && attrName === 'tags') {
                    return this.wipeAttribute$(attrName);
                }
                if (!keepMeta && attrName === 'meta') {
                    return this.meta.wipe$();
                }

                return of(true);
            })
        ).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
            map(results => results.indexOf(false) === -1)
        );


    }

    public override wipe$(keepTags = true, keepMeta = true): Observable<boolean> {
        if (this.isInitialized) {
            return this.wipeAttributes$(this.attributes, keepTags, keepMeta);
        }

        return of(true);

    }


    public async onInit() {
        if (this.isInitialized) { return; }
        const subs = this.subscribeTopics();

        subs.forEach(sub => sub.activate());

        if (this.mode === HomieDeviceMode.Device) {
            await lastValueFrom(this.publishAttributes$());
        }
        this._initialized = true;
    }



    public subscribeTopics(): MqttSubscription[] {
        const subs: MqttSubscription[] = [];

        // Always subscribe to $meta changes
        const metaSub = this.subscribe(`${H_ATTR_META}/#`);
        subs.push(metaSub);

        metaSub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
            next: msg => {
                this.log.silly(`${this.id} - Subscription to '$meta' - onMessage [${msg.topic}]: ${msg.payload}`);
                const metaKeyIndex = msg.topicTokens.indexOf(H_ATTR_META);
                const metaTokens = msg.topicTokens.slice(metaKeyIndex);
                const value = msg.payload.toString();
                this.meta.parseMessage(metaTokens, value);
            },
            complete: () => {
                this.unsubscribe(`${H_ATTR_META}/#`);
            }
        });

        // if in controller mode - subscribe to all attributes;
        if (this.mode === HomieDeviceMode.Controller) {
            const attrsSub = this.subscribe('+');
            subs.push(attrsSub);

            attrsSub.messages$.pipe(           // Subscribe to device attributes
                takeUntil(this.onDestroy$),
                filter(msg =>
                    msg.topicTokens[msg.topicTokens.length - 1].startsWith('$') &&
                    !(msg.topicTokens[msg.topicTokens.length - 1] === H_ATTR_META)) // filter out messages for $meta and $tags (they are handled seperately)
            ).subscribe({
                next: msg => {
                    this.log.silly(`${this.id} - Subscription to '+' - onMessage [${msg.topic}]: ${msg.payload}`);
                    const value = msg.payload.toString();
                    if (msg.topicTokens[msg.topicTokens.length - 1] === H_ATTR_TAGS) {
                        // handle $tags attribute
                        this.setAttribute('tags', parseCSVString(value))
                    } else {
                        // handle all other attributes
                        const attr = msg.topicTokens[msg.topicTokens.length - 1].substr(1) as keyof TAttributes; // get dollar less atrr name
                        this.onItemAttributeMessage(attr, value);
                    }
                },
                complete: () => {
                    this.unsubscribe(`+`);
                }
            });

        } else { // Device Mode - only subscribe to tags changes

            // Subscribe to $tags changes
            const tagSub = this.subscribe('$tags');
            subs.push(tagSub);

            tagSub.messages$.pipe(takeUntil(this.onDestroy$), distinctUntilChanged()).subscribe({
                next: msg => {
                    this.log.silly(`${this.id} - Subscription to '$tags' - onMessage [${msg.topic}]: ${msg.payload}`);
                    const tags = parseCSVString(msg.payload.toString());
                    this.setAttribute('tags', tags)
                }
            });
        }


        return subs;
    }





    onItemAttributeMessage<T extends keyof TAttributes>(name: T, rawValue: string) {
        this.setAttribute(name, this.parseAttribute(name, rawValue))
    }


}