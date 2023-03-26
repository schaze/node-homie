import { HomieElement } from "./HomieElement";
import { HomieDevice } from "./HomieDevice";
import { HomieProperty } from "./HomieProperty";
import { DictionaryStore } from "./misc";
import { HomieID, NodeDescription, NodePointer, notNullish, ObjectMap, PropertyDescription } from "./model";
import { NodeAttributes } from "./model";
import { isObjectEmpty, mapObject } from "./util";
import { Observable } from "rxjs";
import { IClientPublishOptions } from "mqtt";
import { MqttSubscription } from "./mqtt";


export class HomieNode extends HomieElement<NodeAttributes, NodePointer, NodeDescription> {

    public readonly topic: string;
    public readonly pointer: NodePointer;
    public set descriptionUpdateNeeded(value: boolean) {
        this.device.descriptionUpdateNeeded = value;
    }

    protected propertyStore = new DictionaryStore<HomieProperty>(property => property.id);

    public properties$ = this.propertyStore.state$;
    public propertiesChange$ = this.propertyStore.events$;

    public get properties() {
        return this.propertyStore.state;
    }

    constructor(
        public readonly device: HomieDevice,
        attributes: NodeAttributes
    ) {
        super(attributes);
        this.topic = `${device.topic}/${this.id}`;
        this.pointer = `${device.pointer}/${this.id}`;
    }

    public static fromDescription<NODE extends HomieNode, PROP extends HomieProperty>(
        device: HomieDevice,
        id: HomieID,
        description: NodeDescription
    ): HomieNode {
        const { properties, ...nodeAttributes } = description;
        const node = new HomieNode(device, { ...nodeAttributes, id })

        if (notNullish(properties)) {
            node.propertyStore.addOrUpdateMany(mapObject(properties, (id, data) => new HomieProperty(node, { ...data, id })));
        }

        return node;
    }

    public getDescription(): NodeDescription {
        const { id, ...desc } = this.attributes;
        return {
            ...desc,
            properties: mapObject(this.properties, (id, property) => property.getDescription())
        }
    }

    public async updateFromDescription(description?: NodeDescription) {
        if (description === undefined || description === null) {
            return;
        }

        const { properties, ...updatedAttributes } = description;

        this.updateAttributes({ ...updatedAttributes, id: this.id });

        if (notNullish(properties)) {
            await this.updateProperties(properties);
        }

    }

    protected async updateProperties(propertyDescriptions: ObjectMap<HomieID, PropertyDescription>) {

        // update changed and add new properties
        const addedProperties: ObjectMap<HomieID, HomieProperty> = {};
        for (const id in propertyDescriptions) {
            if (Object.prototype.hasOwnProperty.call(propertyDescriptions, id)) {
                const propertyAttrs = propertyDescriptions[id];
                const exitingProperty = this.propertyStore.getItem(id);
                if (exitingProperty) {
                    exitingProperty.updateAttributes({ ...propertyAttrs, id });
                } else {
                    addedProperties[id] = new HomieProperty(this, { ...propertyAttrs, id });
                }
            }
        }
        if (!isObjectEmpty(addedProperties)) {
            this.propertyStore.addOrUpdateMany(addedProperties);
            if (this.isInitialized) {
                await Promise.all(Object.entries(addedProperties).map(([_, property]) => property.onInit()));
            }
        }

        // remove deleted properties
        const removedProperties: HomieID[] = [];
        for (const id in this.properties) {
            if (Object.prototype.hasOwnProperty.call(this.properties, id)) {
                const property = this.properties[id];
                // if existing node id is not in new nodeDescriptions, the node has to be removed
                if (!Object.prototype.hasOwnProperty.call(propertyDescriptions, id)) {
                    removedProperties.push(id)
                }
            }
        }
        const removed = this.propertyStore.removeMany(removedProperties);
        await Promise.all(Object.entries(removed).map(([_, item]) => item.onDestroy()));
    }


    public override async onInit() {
        if (this.isInitialized) { return; }
        await Promise.all(Object.entries(this.properties).map(([_, property]) => property.onInit()));
        this._isInitialized = true;

    }


    /**
     * @description
     * Adds a property to the node 
     * Please note:
     * This will not take care of initializing the property or publishing the '$description' attribute.
     * In case the device is already initialized. Please use {@link deviceChangeTransaction} or {@link deviceChangeTransactionAsync} to wrap this and ensure to call the properties's {@link HomieProperty.onInit} method.
     * @param property : new property to add (also accepts undefined values for convinience)
     * @returns added property
     */
    public add<T extends (HomieProperty | undefined) = HomieProperty>(property: T): T {
        if (!property) { return <T>undefined; }
        if (property.node !== this) { throw new Error(`Property ${property.id} cannot be added to node ${this.id} as it has a different parent: ${property.node?.id}`); }
        const anode = this.propertyStore.add(property) as T;
        return anode;
    }

    /**
     * Returns property for id.
     * 
     * @param propId id of property or nullish for convinience
     * @returns property for the given id. or undefined if property was not found
     */
    public get<T extends HomieProperty = HomieProperty>(propId: string | null | undefined): T | undefined {
        if (propId === null || propId === undefined) { return undefined; }
        return this.propertyStore.getItem(propId) as T;
    }


    /**
     * Removes a property from the node.
     * Please note:
     * This will not take care of wiping or destroying the property. Neither will the '$description' attribute be published or anything else needed in case the device is already initialized.
     * In case the device is already initialized. Please use {@link deviceChangeTransaction} or {@link deviceChangeTransactionAsync} to wrap this and ensure to call the property's {@link HomieProperty.onDestroy} method.
     * @param prop property to remove or property id to remove - or nullish for convinience
     * @returns Removed property or undefined if the property was not found.
     */
    public remove<T extends HomieProperty = HomieProperty>(prop: T | string | null | undefined): T | undefined {
        if (prop === undefined || prop === null) { return undefined; }
        const anode = this.propertyStore.remove(typeof prop === 'string' ? prop : prop.id) as T;
        return anode;
    }



    protected mqttPublish$(path: string, value: string | null | undefined, options: IClientPublishOptions, publishEmpty: boolean): Observable<boolean> {
        return this.device.publish$(path, value, options, publishEmpty);
    }
    protected mqttSubscribe(path: string): MqttSubscription {
        return this.device.subscribe(path);
    }
    protected mqttUnsubscribe(path: string): void {
        return this.device.unsubscribe(path);
    }

    public override async onDestroy() {
        await super.onDestroy();
        await Promise.all(Object.entries(this.properties).map(([_, property]) => property.onDestroy()));
        await this.propertyStore.onDestroy();

    }
}