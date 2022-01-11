import { HomieNode } from "./Node";
import { HomieRootBase } from "./homie-base/HomieRootBase";
import { defaultIfEmpty, filter, map, mapTo, mergeMap, pluck, share, shareReplay, switchMap, takeUntil, tap } from "rxjs/operators";
import { mergeWatchList, toIndex } from "./rx";
import { forkJoin, lastValueFrom, merge, Observable, of } from "rxjs";
import { HomieDeviceAtrributes, BaseItemAtrributes, HomieDeviceMode, HOMIE_EXT_META_4, DeviceState, MQTTConnectOpts } from "./model";
import { parseCSVString } from "./util";
import { DictionaryStore } from "./misc";
import { MqttSubscription, RxMqtt } from "./mqtt";


const HD_ATTR_STATE = '$state';
const HOMIE_VERSION = '4.0.0';


export class HomieDevice extends HomieRootBase<HomieDeviceAtrributes> {
    static counter = 0;
    static readonly version = HOMIE_VERSION;

    protected nodeStore = new DictionaryStore<HomieNode>(node => node.id);

    public nodes$ = this.nodeStore.state$;
    public nodesChange$ = this.nodeStore.events$;

    public get nodes() {
        return this.nodeStore.state;
    }

    public nodesList$ = this.nodeStore.asArray$;

    public nodesIndex$ = this.nodesList$.pipe(
        toIndex(node => node.pointer),
        shareReplay(1),
    )

    public propertiesChange$ = this.nodesList$.pipe(
        switchMap(nodes => merge(...nodes.map(node => node.propertiesChange$))),
        share()
    )

    public propertiesList$ = this.nodesList$.pipe(
        mergeWatchList(items => items.propertiesList$),
        shareReplay(1)
    );

    public propertiesIndex$ = this.propertiesList$.pipe(
        toIndex(prop => prop.pointer),
        shareReplay(1),
    )

    protected suspendUpdates = true;

    constructor(attrs: HomieDeviceAtrributes, mqttOptions: MQTTConnectOpts | RxMqtt, mode: HomieDeviceMode = HomieDeviceMode.Device) {
        super(attrs, mqttOptions, mode);
        if (this.mode === HomieDeviceMode.Device) {
            this.mqttOpts.will = {
                topic: `${this.topic}/${HD_ATTR_STATE}`,
                payload: 'lost',
                qos: 2,
                retain: true
            }
            this._attributes$.next({ ...this.attributes, homie: HomieDevice.version, extensions: HOMIE_EXT_META_4, state: "init" })
        }
    }

    protected override parseAttribute<T extends keyof HomieDeviceAtrributes>(name: T, rawValue: string): HomieDeviceAtrributes[T] {
        switch (name) {
            case 'state':
                return rawValue as DeviceState as HomieDeviceAtrributes[T]
            case 'extensions':
            case 'homie':
            case 'implementation':
            case 'nodes':
            default:
                return super.parseAttribute(name, rawValue);
        }
    }

    /**
     * Add a node to the device and update the 'nodes' attribute list.
     * Please note:
     * This will not take care of initializing the node or publishing the 'nodes' attribute or anything else needed in case the device is already initialized. Please use {@link addInitNode} for this.
     * @param node : new node to add (also accepts undefined values for convinience)
     * @returns added node
     */
    public add<T extends (HomieNode | undefined) = HomieNode>(node: T): T {
        if (!node) { return <T>undefined; }
        if (node.parent !== this) { throw new Error(`Property ${node.id} cannot be added to device ${this.id} as it has a different parent: ${node.parent?.id}`); }
        const anode = this.nodeStore.add(node) as T;
        this.setAttribute("nodes", Object.keys(this.nodes).join(','), true);
        return anode;
    }

    /**
     * Add a new node to the device and take care of everything in case the device is already initialized.
     * Will return once node and 'nodes' attribute is fully published
     * Will emit a warn log if the device is not in 'init' state.
     * 
     * @param node new node to add (also accepts undefined values for convinience)
     * @returns Promise with the added node
     */
    public async addInitNode<T extends (HomieNode | undefined) = HomieNode>(node: T): Promise<T> {
        const anode = this.add(node); // add node and update nodes attribute
        if (this.isInitialized) {   // if device is already initialized
            await anode?.onInit()   // initialize node

            if (this.mode === HomieDeviceMode.Device) { // if we are in device mode, also publish the nodes attibute
                if (this.attributes.state !== 'init') {
                    this.log.warn(`Changed device structure without beeing in 'init' (current state: '${this.attributes.state}') state. This is against specification.`)
                }
                await lastValueFrom(this.publishAttribute$('nodes', this.attributes.nodes));
            }

        }
        return anode;
    }

    /**
     * Return node for id.
     * 
     * @param nodeId id of node or nullish for convinience
     * @returns node for the given id. or undefined if node was not found
     */
    public get<T extends HomieNode = HomieNode>(nodeId: string | null | undefined): T | undefined {
        if (nodeId === null || nodeId === undefined) { return undefined; }
        return this.nodeStore.getItem(nodeId) as T;
    }


    /**
     * Removes a node from the device and updates the 'nodes' attribute if the node was actually attached to the device.
     * Please note:
     * This will not take care of wiping or destroying the node. Neither will the 'nodes' attribute be published or anything else needed in case the device is already initialized. Please use {@link removeInitNode} for this.
     * @param node Node to remove or node id to remove - or nullish for convinience
     * @returns Removed node or undefined if the node was not found.
     */
    public remove<T extends HomieNode = HomieNode>(node: T | string | null | undefined): T | undefined {
        if (node === undefined || node === null) { return undefined; }
        const anode = this.nodeStore.remove(typeof node === 'string' ? node : node.id) as T;
        if (anode) {
            this.setAttribute("nodes", Object.keys(this.nodes).join(','));
        }
        return anode;
    }


    /**
     * Remove a node from the device and take care of wiping (when in device mode) and destroying the node in case the device is already initialized.
     * Will return once 'nodes' attribute is fully published and node is wiped (when in device mode) and destroyed
     * Will emit a warn log if the device is not in 'init' state.
     * @param node node or id to remove or nullish for convinience
     * @returns Promise with the removed node
     */
    public async removeInitNode<T extends HomieNode = HomieNode>(node: T | string | null | undefined): Promise<T | undefined> {
        const rnode = this.remove(node);
        if (!rnode) { return undefined; }

        this.log.silly(`removing initialized node: ${rnode.pointer}`);
        if (this.isInitialized) {
            if (this.mode === HomieDeviceMode.Device) {
                if (this.attributes.state !== 'init') {
                    this.log.warn(`Changed device structure without beeing in 'init' (current state: '${this.attributes.state}') state. This is against specification.`)
                }
                await lastValueFrom(this.publishAttribute$('nodes', this.attributes.nodes));
                await lastValueFrom(rnode.wipe$());
            }

            await rnode.onDestroy(); // destroy node -- not sure if this should always be done.
        }

        return rnode as T;
    }



    public sendStateUpdate$(state?: DeviceState | null): Observable<boolean> {
        if (!this.isInitialized || this.mode !== HomieDeviceMode.Device) { return of(true); }
        return this.publishAttribute$('state', (state !== null && state !== undefined) ? state : this.attributes.state)
    }

    public updateState$(state?: DeviceState | null): Observable<boolean> {
        this.setAttribute('state', state);
        return this.sendStateUpdate$(state);
    }

    public override async onInit(): Promise<void> {
        if (this.isInitialized) { return; }
        super.onInit();
        try {
            const mqttInit = this.mqtt.onInit()
            this._isInitialized = true;
            this.mqtt.onError$.pipe(takeUntil(this.onDestroy$), tap(err => { this.onError(err); })).subscribe();
            this.mqtt.onConnect$.pipe(takeUntil(this.onDestroy$), tap(() => { this.onConnect(); })).subscribe();
            await mqttInit;
            
            const subs = this.subscribeTopics();
            subs.forEach(sub => sub.activate());

            this.suspendUpdates = false;

        } catch (err) {
            console.error(`${this.id} - error connecting to mqtt broker.`, err)
            this.log.error(`${this.id} - error connecting to mqtt broker.`, err);
            return Promise.reject(err)
        }
    }

    public override wipe$(keepTags = true, keepMeta = true): Observable<boolean> {
        return forkJoin([
            super.wipe$(keepTags, keepMeta),
            ...Object.entries(this.nodes).map(([_, node]) => {
                return node.wipe$(keepTags, keepMeta);
            })]
        ).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
            map(results => results.indexOf(false) === -1)
        );
    }

    public override subscribeTopics(): MqttSubscription[] {
        const subs = super.subscribeTopics();

        // In device mode - keep device state correct by updating potentially overwritten states
        // --> this might be removed in the future.
        if (this.mode === HomieDeviceMode.Device) {
            const sub = this.subscribe(HD_ATTR_STATE);
            subs.push(sub);

            sub.messages$.pipe(
                takeUntil(this.onDestroy$),
                tap(msg => {
                    const state = msg.payload.toString();
                    if (state !== this.attributes.state) {
                        this.updateState$(this.attributes?.state).subscribe();
                    }

                })
            ).subscribe();
        }
        return subs;
    }


    public override onItemAttributeMessage<T extends keyof HomieDeviceAtrributes>(name: T, rawValue: string) {
        super.onItemAttributeMessage(name, rawValue);
        if (this.mode === HomieDeviceMode.Controller && name === 'nodes') {
            const newNodeIds = parseCSVString(rawValue);
            for (let index = 0; index < newNodeIds.length; index++) {
                const nodeId = newNodeIds[index];
                if (!this.nodeStore.hasId(nodeId)) {
                    this.addInitNode(new HomieNode(this, { id: nodeId }));
                }
            }
            if (this.attributes.state === 'init' && this.isInitialized) { // if device is in init mode we also check for removed nodes
                const existingNodeIds = Object.keys(this.nodeStore.state)
                for (let index = 0; index < existingNodeIds.length; index++) {
                    const nodeId = existingNodeIds[index];
                    if (!newNodeIds.includes(nodeId)) {
                        this.removeInitNode(nodeId);
                    }
                }
            }
        }
    }


    public deviceChangeTransaction(cb: () => Promise<boolean>): Observable<boolean> {
        return new Observable<boolean>((subscriber) => {
            lastValueFrom(this.updateState$('init'))
                .then(cb)
                .then(result => {
                    subscriber.next(result);
                }).catch(err => {
                    subscriber.error(err);
                }).finally(() => {
                    lastValueFrom(this.updateState$('ready'))
                        .finally(() => {
                            subscriber.complete();
                        })
                })
        });
    }

    public deviceChangeTransactionAsync(cb: () => Promise<boolean>): Promise<boolean> {
        return lastValueFrom(this.deviceChangeTransaction(cb));
    }

    public async onConnect() {
        if (this.mode === HomieDeviceMode.Device) {
            await this.deviceChangeTransactionAsync(async () => {
                await Promise.all(Object.entries(this.nodes).map(([_, node]) => node.onInit()));
                this.setAttribute("nodes", Object.keys(this.nodes).join(','), true); // make sure nodes attribute is up to date.
                await lastValueFrom(this.publishAttributes$({ ...this.attributes, state: undefined })); // publish all except state attribute
                return true
            });
        }
    }

    private async disconnect() {
        if (this.isInitialized) {
            // await this.sendStateUpdate('disconnected');
            // this.log.verbose(`disconnecting...`)
            await lastValueFrom(this.updateState$('disconnected'));
            try {
                await this.mqtt.onDestroy();
                this.log.debug('Connection closed');
            } catch (err) {
                this.log.error('Error closing mqtt connection: ', err);
            }
        }
    }

    public override async onDestroy() {
        super.onDestroy();
        await Promise.all(Object.entries(this.nodes).map(([_, node]) => node.onDestroy()));
        await this.disconnect();
        await this.nodeStore.onDestroy();
    }
}