import { stat } from "fs";
import { Validator } from "jsonschema";
import { IClientPublishOptions } from "mqtt";
import { BehaviorSubject, catchError, combineLatest, filter, lastValueFrom, map, Observable, of, startWith, switchMap, takeUntil, withLatestFrom } from "rxjs";
import { HomieElement } from "./HomieElement";
import { HomieNode } from "./HomieNode";
import { DictionaryStore } from "./misc";
import { MQTTConnectOpts, HomieDeviceMode, HomieID, DevicePointer, HomieVersion, HOMIE_VERSION, notNullish, ObjectMap, NodeDescription, ToRXObjectAttributes, isDeviceState, IDAttribute, IDAttributeImpl, HomieElementDescription } from "./model";
import { DeviceAttributes, DeviceDescription, DeviceState } from "./model";
import { MqttSubscription, RxMqtt } from "./mqtt";
import { isObjectEmpty, makeV5BaseTopic, mapObject } from "./util";

export const HD_ATTR_STATE = '$state';
export const HD_ATTR_DESCRIPTION = '$description';

const schema = require('./DeviceDescription.Schema.json');




export class HomieDevice extends HomieElement<DeviceAttributes, DevicePointer, DeviceDescription> {
    protected readonly sharedMqttClient: boolean;
    protected readonly rootTopic: string;
    public readonly topic: string;
    public readonly pointer: DevicePointer;


    protected _rootState$ = new BehaviorSubject<DeviceState | undefined>(undefined);
    public rootState$ = this._rootState$.asObservable();

    public get rootState(): DeviceState | undefined {
        return this._rootState$.value;
    }
    protected set rootState(value: DeviceState | undefined) {
        this._rootState$.next(value);
    }

    public get deviceState(): DeviceState {
        return this.attributes.state
    }
    protected set deviceState(value: DeviceState) {
        this.setAttribute('state', value);
    }


    public readonly state$: Observable<DeviceState>;

    /**
     * @description
     * Will return the combined state of this device and (if applicable) the connected root device. 
     * Note: If you only want the deviceState use the deviceState attribute.
     */
    public get state(): DeviceState {
        if (this.rootState !== 'lost') {
            return this.attributes.state
        } else {
            return this.rootState
        }
    }

    protected mqttOpts: MQTTConnectOpts;
    protected mqtt: RxMqtt;

    public get homie(): HomieVersion {
        return this.attributes.homie;
    }

    public get version(): number {
        return this.attributes.version;
    }
    protected set version(value: number) {
        this.setAttribute('version', value);
    }

    private _descriptionUpdateNeeded = false;

    public get descriptionUpdateNeeded() {
        return this._descriptionUpdateNeeded;
    }
    public override set descriptionUpdateNeeded(value) {
        this._descriptionUpdateNeeded = value;
    }


    protected validator = new Validator();

    protected nodeStore = new DictionaryStore<HomieNode>(node => node.id);

    public nodes$ = this.nodeStore.state$;
    public nodesChange$ = this.nodeStore.events$;

    public get nodes() {
        return this.nodeStore.state;
    }

    constructor(
        attributes: Partial<DeviceAttributes> & IDAttribute,
        mqttOrMqttOptions: MQTTConnectOpts | RxMqtt,
        public readonly mode: HomieDeviceMode = HomieDeviceMode.Device
    ) {
        super({ homie: HOMIE_VERSION, state: 'init', version: 0, ...attributes });

        this.sharedMqttClient = mqttOrMqttOptions instanceof RxMqtt;

        this.state$ = combineLatest({
            state: this.attributes$.pipe(map(attrs => attrs.state)),
            rootState: this.rootState$
        }).pipe(map(states => {
            if (states.rootState !== 'lost') {
                return states.state
            } else {
                return states.rootState
            }
        }))

        this.mqttOpts = mqttOrMqttOptions instanceof RxMqtt ? { ...mqttOrMqttOptions.mqttOpts } : { ...mqttOrMqttOptions }
        this.rootTopic = makeV5BaseTopic(this.mqttOpts.topicRoot);
        this.topic = `${this.rootTopic}/${this.id}`
        this.pointer = this.id;

        if (this.mode === HomieDeviceMode.Device) {
            if (!this.sharedMqttClient) {
                this.mqttOpts.will = {
                    topic: `${this.topic}/${HD_ATTR_STATE}`,
                    payload: 'lost',
                    qos: 2,
                    retain: true
                }
            }
            this._descriptionUpdateNeeded = true;
            this.patchAttributes({ homie: HOMIE_VERSION, state: 'init', version: 0 });
        }

        this.mqtt = ((mqttOrMqttOptions instanceof RxMqtt)) ? mqttOrMqttOptions : new RxMqtt(this.mqttOpts);

    }

    public static fromDescription(
        id: HomieID,
        description: DeviceDescription,
        mqttOrMqttOptions: MQTTConnectOpts | RxMqtt,
        mode: HomieDeviceMode = HomieDeviceMode.Controller
    ): HomieDevice {
        const { nodes, ...attributes } = description;
        const device = new HomieDevice({ ...attributes, id, state: 'init' }, mqttOrMqttOptions, mode);

        if (notNullish(nodes)) {
            device.nodeStore.addOrUpdateMany(mapObject(nodes, (id, data) => HomieNode.fromDescription(device, id, data)));
        }

        return device;
    }


    public async updateFromDescription(description?: DeviceDescription) {
        if (description === undefined || description === null) {
            return;
        }

        const valid = this.validateDescription(description);
        if (!valid) {
            throw new Error(`DeviceDescription for device [${this.id}] has formatting errors (see above).`);
        }

        const { nodes, ...updatedAttributes } = description;

        // if the versions match, there is nothing to do
        if (this.version === updatedAttributes.version) {
            return;
        }

        this.updateAttributes({ ...updatedAttributes, id: this.id, state: this.deviceState });

        if (notNullish(nodes)) {
            await this.updateNodes(nodes);
        }

    }

    protected async updateNodes(nodeDescriptions: ObjectMap<HomieID, NodeDescription>) {

        // update changed and add new nodes
        const addedNodes: ObjectMap<HomieID, HomieNode> = {};
        for (const id in nodeDescriptions) {
            if (Object.prototype.hasOwnProperty.call(nodeDescriptions, id)) {
                const nodeDescription = nodeDescriptions[id];
                const exitingNode = this.nodeStore.getItem(id);
                if (exitingNode) {
                    exitingNode.updateFromDescription(nodeDescription);
                } else {
                    addedNodes[id] = HomieNode.fromDescription(this, id, nodeDescription);
                }
            }
        }
        if (!isObjectEmpty(addedNodes)) {
            this.nodeStore.addOrUpdateMany(addedNodes);
            if (this.isInitialized) {
                await Promise.all(Object.entries(addedNodes).map(([_, node]) => node.onInit()));
            }
        }

        // remove deleted nodes
        const removedNodes: HomieID[] = [];
        for (const id in this.nodes) {
            if (Object.prototype.hasOwnProperty.call(this.nodes, id)) {
                const node = this.nodes[id];
                // if existing node id is not in new nodeDescriptions, the node has to be removed
                if (!Object.prototype.hasOwnProperty.call(nodeDescriptions, id)) {
                    removedNodes.push(id)
                }
            }
        }
        const removed = this.nodeStore.removeMany(removedNodes);
        await Promise.all(Object.entries(removed).map(([_, node]) => node.onDestroy()));
    }



    public getDescription(): DeviceDescription {
        const { id, state, ...desc } = this.attributes;
        return {
            ...desc,
            nodes: mapObject(this.nodes, (id, node) => node.getDescription())
        }
    }

    public override async onInit(): Promise<void> {
        if (this.isInitialized) { return; }
        try {
            if (!this.sharedMqttClient) {
                const mqttInit = this.mqtt.onInit()
                this._isInitialized = true;
                this.mqtt.onError$.pipe(takeUntil(this.onDestroy$)).subscribe({ next: err => { this.onError(err); } });
                this.mqtt.onConnect$.pipe(takeUntil(this.onDestroy$)).subscribe({ next: () => { this.onConnect(); } });
                await mqttInit;
            } else {
                this._isInitialized = true;
                this.mqtt.onError$.pipe(takeUntil(this.onDestroy$)).subscribe({ next: err => { this.onError(err); } });
                this.mqtt.onConnect$.pipe(takeUntil(this.onDestroy$), startWith(undefined)).subscribe({ next: () => { this.onConnect(); } });
            }

            const subs = this.subscribeTopics();
            subs.forEach(sub => sub.activate());

        } catch (err) {
            console.error(`${this.id} - error connecting to mqtt broker.`, err)
            this.log.error(`${this.id} - error connecting to mqtt broker.`, err);
            return Promise.reject(err)
        }
    }



    public subscribeTopics(): MqttSubscription[] {
        const subs = [];

        // In device mode - keep device state correct by updating potentially overwritten states
        // --> this might be removed in the future.
        if (this.mode === HomieDeviceMode.Device) {
            const sub = this.subscribe(HD_ATTR_STATE);
            subs.push(sub);

            sub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: msg => {
                    const state = msg.payload.toString();
                    if (state !== this.deviceState) {
                        this.updateState$(this.deviceState).subscribe();
                    }

                }
            });
        } else if (this.mode === HomieDeviceMode.Controller) {
            const descSub = this.subscribe(HD_ATTR_DESCRIPTION);
            subs.push(descSub);

            descSub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: msg => {
                    const description = msg.payload.toString();
                    if (description !== undefined && description !== null) {
                        try {
                            this.updateFromDescription(JSON.parse(description));
                        } catch (error) {
                            this.log.error(`Cannot parse description!`, error);
                        }
                    }

                }
            });
            const stateSub = this.subscribe(HD_ATTR_STATE);
            subs.push(stateSub);

            stateSub.messages$.pipe(takeUntil(this.onDestroy$)).subscribe({
                next: msg => {
                    const state = msg.payload.toString();
                    if (isDeviceState(state)) {
                        // this.log.info(`State received: ${state}`);
                        this.deviceState = state;
                    }
                }
            });

            this.attributes$.pipe(
                takeUntil(this.onDestroy$),
                map(attrs => attrs.root),
                filter(root => !!root),
                switchMap(root => {
                    const sub = this.mqttSubscribe(`${root}/${HD_ATTR_STATE}`);
                    subs.push(sub);
                    return sub.messages$
                }),
                takeUntil(this.onDestroy$),
            ).subscribe({
                next: msg => {
                    
                    const rootState = msg.payload.toString();
                    if (isDeviceState(rootState)) {
                        // this.log.info(`RootState received: ${rootState}`);
                        this.rootState = rootState;
                    }


                }
            });
        }
        return subs;
    }



    /**
     * @description
     * Adds a node to the device and update the 'nodes' attribute list.
     * Please note:
     * This will not take care of initializing the node or publishing the '$description' attribute.
     * In case the device is already initialized. Please use {@link deviceChangeTransaction} or {@link deviceChangeTransactionAsync} to wrap this and ensure to call the node's {@link HomieNode.onInit} method.
     * @param node : new node to add (also accepts undefined values for convinience)
     * @returns added node
     */
    public add<T extends (HomieNode | undefined) = HomieNode>(node: T): T {
        if (!node) { return <T>undefined; }
        if (node.device !== this) { throw new Error(`Property ${node.id} cannot be added to device ${this.id} as it has a different parent: ${node.device?.id}`); }
        const anode = this.nodeStore.add(node) as T;
        return anode;
    }

    /**
     * Returns node for id.
     * 
     * @param nodeId id of node or nullish for convinience
     * @returns node for the given id. or undefined if node was not found
     */
    public get<T extends HomieNode = HomieNode>(nodeId: string | null | undefined): T | undefined {
        if (nodeId === null || nodeId === undefined) { return undefined; }
        return this.nodeStore.getItem(nodeId) as T;
    }


    /**
     * Removes a node from the device.
     * Please note:
     * This will not take care of wiping or destroying the node. Neither will the '$description' attribute be published or anything else needed in case the device is already initialized.
     * In case the device is already initialized. Please use {@link deviceChangeTransaction} or {@link deviceChangeTransactionAsync} to wrap this and ensure to call the node's {@link HomieNode.onDestroy} method.
     * @param node Node to remove or node id to remove - or nullish for convinience
     * @returns Removed node or undefined if the node was not found.
     */
    public remove<T extends HomieNode = HomieNode>(node: T | string | null | undefined): T | undefined {
        if (node === undefined || node === null) { return undefined; }
        const anode = this.nodeStore.remove(typeof node === 'string' ? node : node.id) as T;
        return anode;
    }


    protected override mqttPublish$(path: string, value: string | null | undefined, options?: IClientPublishOptions, publishEmpty = false): Observable<boolean> {
        if (!this.isInitialized) { throw new Error('Trying to publish while not initialized!'); } // return of(false) instead of throwing error?
        if (!publishEmpty && (value === undefined || value === null || value === '')) { return of(true); }
        this.log.silly(`Publishing ${path} -> ${value}  | options: ${options}`);
        return this.mqtt.publish$(`${this.rootTopic}/${path}`, (value === '' || value === undefined) ? null : value, options).pipe(
            map(_ => true),
            catchError(err => of(false))
        )
    }

    protected override mqttSubscribe(path: string): MqttSubscription {
        return this.mqtt.subscribe(`${this.rootTopic}/${path}`, { qos: 2, rh: 0 });
    }

    protected override mqttUnsubscribe(path: string) {
        this.mqtt.unsubscribe(`${this.rootTopic}/${path}`);
    }


    protected publishAttribute$(attrName: string, data: any, opts: IClientPublishOptions = { qos: 2, retain: true }) {
        return this.mqttPublish$(`${this.id}/${attrName}`, data, opts);
    }

    protected publishDescription$() {
        if (!this._descriptionUpdateNeeded || !this.isInitialized) { return of(this.version); }
        this.version = Date.now();
        return this.publishAttribute$(HD_ATTR_DESCRIPTION, JSON.stringify(this.getDescription())).pipe(map(_ => {
            this._descriptionUpdateNeeded = false;
            return this.version;
        }));
    }



    public sendStateUpdate$(state?: DeviceState | null): Observable<boolean> {
        if (!this.isInitialized || this.mode !== HomieDeviceMode.Device) { return of(true); }
        return this.publishAttribute$(HD_ATTR_STATE, (state !== null && state !== undefined) ? state : this.deviceState)
    }

    public updateState$(state: DeviceState): Observable<boolean> {
        this.deviceState = state;
        return this.sendStateUpdate$(state);
    }

    /**
     * In case changes to the device's structure are performed after the device is already initialized and published, use this method to wrap the changes in a callback (cb) function.
     * An `init` state will be published before the callback is executed and in case of any changes the `$description` attribute will be published before the state is set back to `ready` again.
     * @param cb async callback with changes to device's structure. Return true on success, false on failure.
     * @returns Observable with the callbacks boolean return value
     */
    public deviceChangeTransaction(cb: () => Promise<boolean>): Observable<boolean> {
        return new Observable<boolean>((subscriber) => {
            lastValueFrom(this.updateState$('init'))
                .then(cb)
                .then(async result => {
                    await lastValueFrom(this.publishDescription$()); // publish description
                    subscriber.next(result);
                }).catch(err => {
                    subscriber.error(err);
                }).finally(async () => {
                    await lastValueFrom(this.updateState$('ready'))
                        .finally(() => {
                            subscriber.complete();
                        })
                })
        });
    }

    /**
     * In case changes to the device's structure are performed after the device is already initialized and published, use this method to wrap the changes in a callback (cb) function.
     * An `init` state will be published before the callback is executed and in case of any changes the `$description` attribute will be published before the state is set back to `ready` again.
     * @param cb async callback with changes to device's structure. Return true on success, false on failure.
     * @returns Promise with the callbacks boolean return value
     */
    public deviceChangeTransactionAsync(cb: () => Promise<boolean>): Promise<boolean> {
        return lastValueFrom(this.deviceChangeTransaction(cb));
    }

    public async onConnect() {
        if (this.mode === HomieDeviceMode.Device && this.mqtt.connectionInfo.connected) {
            await this.deviceChangeTransactionAsync(async () => {
                await Promise.all(Object.entries(this.nodes).map(([_, node]) => node.onInit()));
                return true;
            });
        }
    }

    public onError(err: Error): void {

    }

    private async disconnect() {
        if (this.isInitialized) {
            if (this.mode === HomieDeviceMode.Device) {
                await lastValueFrom(this.updateState$('disconnected'));
            }
            try {
                if (!this.sharedMqttClient) {
                    await this.mqtt.onDestroy();
                    this.log.debug('Connection closed');
                }
            } catch (err) {
                this.log.error('Error closing mqtt connection: ', err);
            }
        }
    }


    protected validateDescription(description: DeviceDescription): boolean {
        const result = this.validator.validate(description, schema, { nestedErrors: true })
        if (!result.valid) {
            result.errors.forEach(error => {
                this.log.error(`Error parsing input: ${error.toString()}`);
            })
            return false;
        }
        return true;
    }

    public override async onDestroy() {
        await super.onDestroy();
        await Promise.all(Object.entries(this.nodes).map(([_, node]) => node.onDestroy()));
        await this.disconnect();
        await this.nodeStore.onDestroy();
    }


}