import { HomieProperty } from "./Property";
import { HomieDevice } from "./Device";
import { defaultIfEmpty, map, mapTo, shareReplay, takeUntil, tap } from "rxjs/operators";
import { toIndex } from "./rx";
import { HomieDeviceMode, HomieNodeAtrributes } from "./model";
import { HomieItemBase } from "./homie-base";
import { parseCSVString } from "./util";
import { DictionaryStore } from "./misc";
import { forkJoin, lastValueFrom, Observable } from "rxjs";

export class HomieNode extends HomieItemBase<HomieDevice, HomieNodeAtrributes> {
    static readonly homieItemType = 'HomieNode';

    protected propertyStore = new DictionaryStore<HomieProperty>(prop => prop.id);

    public properties$ = this.propertyStore.state$;
    public propertiesChange$ = this.propertyStore.events$;

    public get properties() {
        return this.propertyStore.state;
    }

    public propertiesList$ = this.propertyStore.asArray$;

    public propertiesIndex$ = this.propertiesList$.pipe(
        toIndex(prop => prop.pointer),
        shareReplay(1)
    )


    public get device() {
        return this.parent;
    }


    constructor(device: HomieDevice, attrs: HomieNodeAtrributes) {
        super(device, attrs)
    }

    protected override parseAttribute<T extends keyof HomieNodeAtrributes>(name: T, rawValue: string): HomieNodeAtrributes[T] {
        switch (name) {
            case 'type':
            case 'properties':
            default:
                return super.parseAttribute(name, rawValue);
        }
    }

    /**
     * Add a property to the node and update the 'properties' attribute list.
     * Please note:
     * This will not take care of initializing the property or publishing the 'properties' attribute or anything else needed in case the node is already initialized. Please use {@link addInitProperty} for this.
     * @param property : new property to add (also accepts undefined values for convinience)
     * @returns added property
     */
    public add<T extends (HomieProperty | undefined) = HomieProperty>(property: T): T {
        if (!property) { return <T>undefined; }
        if (this !== property.parent) { throw new Error(`Property ${property.id} cannot be added to node ${this.id} as it has a different parent: ${property.parent?.id}`); }
        const aprop = this.propertyStore.add(property);
        this.setAttribute("properties", Object.keys(this.properties).join(','), true);
        return aprop as T;
    }

    /**
     * Add a new property to the device and take care of everything in case the node is already initialized.
     * Will return once property and 'properties' attribute is fully published
     * Will emit a warn log if the device is not in 'init' state.
     * 
     * @param property new property to add (also accepts undefined values for convinience)
     * @returns Promise with the added property
     */
    public async addInitProperty<T extends (HomieProperty | undefined) = HomieProperty>(property: T): Promise<T> {
        const aprop = this.add(property);
        if (this.isInitialized) {    // if node is already initialized
            await aprop?.onInit();   // initialize property
            if (this.mode === HomieDeviceMode.Device) {
                if (this.device.attributes.state !== 'init') {
                    this.log.warn(`Changed device structure without beeing in 'init' (current state: '${this.device.attributes.state}') state. This is against specification.`)
                }
                await lastValueFrom(this.publishAttribute$('properties', this.attributes.properties));
            }
        }
        return aprop as T;
    }

    /**
     * Return property for id.
     * 
     * @param propertyId id of property or nullish for convinience
     * @returns property for the given id. or undefined if property was not found
     */
    public get<T extends HomieProperty = HomieProperty>(propertyId: string | null | undefined): T | undefined {
        if (propertyId === null || propertyId === undefined) { return undefined; }
        return this.propertyStore.getItem(propertyId) as T;
    }

    /**
     * Removes a property from the node and updates the 'properties' attribute if the node was actually attached to the node.
     * Please note:
     * This will not take care of wiping or destroying the property. Neither will the 'properties' attribute be published or anything else needed in case the node is already initialized. Please use {@link removeInitProperty} for this.
     * @param property Node to remove or property id to remove - or nullish for convinience
     * @returns Removed property or undefined if the property was not found.
     */
    public remove<T extends HomieProperty = HomieProperty>(property: T | string | null | undefined): T | undefined {
        if (!property) { return undefined; }
        const rprop = this.propertyStore.remove(typeof property === 'string' ? property : property.id);
        if (rprop) {
            this.setAttribute("properties", Object.keys(this.properties).join(','));
        }
        return rprop as T;
    }

    /**
     * Remove a property from the node and take care of wiping (when in device mode) and destroying the property in case the node is already initialized.
     * Will return once 'properties' attribute is fully published and property is wiped (when in device mode) and destroyed
     * Will emit a warn log if the device is not in 'init' state.
     * @param property property or id to remove or nullish for convinience
     * @returns Promise with the removed property
     */
    public async removeInitProperty<T extends HomieProperty = HomieProperty>(property: T | string | null | undefined): Promise<T | undefined> {
        const rprop = this.remove(property);
        if (!rprop) { return undefined; }

        this.log.silly(`removing property: ${rprop.pointer}`);
        if (this.isInitialized) {
            if (this.mode === HomieDeviceMode.Device) {
                if (this.device.attributes.state !== 'init') {
                    this.log.warn(`Changed device structure without beeing in 'init' (current state: '${this.device.attributes.state}') state. This is against specification.`)
                }
                await lastValueFrom(this.publishAttribute$('properties', this.attributes.properties));
                await lastValueFrom(rprop.wipe$());
            }

            await rprop.onDestroy(); // destroy property -- not sure if this should always be done.
        }

        return rprop as T;
    }


    public override async onInit() {
        if (this.isInitialized) { return; }
        await super.onInit();
        await Promise.all(Object.entries(this.properties).map(([_, property]) => property.onInit()));
        this._initialized = true;
    }


    public override wipe$(keepTags = true, keepMeta = true): Observable<boolean> {
        return forkJoin([
            super.wipe$(keepTags, keepMeta),
            ...Object.entries(this.properties).map(([_, property]) => {
                return property.wipe$(keepTags, keepMeta);
            })]
        ).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no attributes)
            map(results => results.indexOf(false) === -1)
        );
    }

    public override onItemAttributeMessage<T extends keyof HomieNodeAtrributes>(name: T, rawValue: string) {
        super.onItemAttributeMessage(name, rawValue);
        if (this.mode === HomieDeviceMode.Controller && name === 'properties') {
            const newPropIds = parseCSVString(rawValue);
            for (let index = 0; index < newPropIds.length; index++) {
                const propId = newPropIds[index];
                if (!this.propertyStore.hasId(propId)) {
                    this.addInitProperty(new HomieProperty(this, { id: propId }));
                }
            }
            if (this.device.attributes.state === 'init' && this.isInitialized) { // if device is in init mode we also check for removed properties
                const existingPropIds = Object.keys(this.propertyStore.state)
                for (let index = 0; index < existingPropIds.length; index++) {
                    const propId = existingPropIds[index];
                    if (!newPropIds.includes(propId)) {
                        this.removeInitProperty(propId);
                    }
                }
            }
        }
    }

    public override async onDestroy() {
        super.onDestroy();
        await Promise.all(Object.entries(this.properties).map(([_, property]) => property.onDestroy()));
        await this.propertyStore.onDestroy();
    }

}