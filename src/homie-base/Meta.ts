import { BehaviorSubject, forkJoin, Observable, of } from "rxjs";
import { defaultIfEmpty, map, mapTo } from "rxjs/operators";
import { HomieBase } from ".";
import { BaseAtrributes, BaseItemAtrributes, MetaAttributes, MetaKeyAttributes, MetaSubkeyAttributes } from "../model";
import { getMetaByKey } from "../util/meta.func";
import { HomieItemBase } from "./HomieItemBase";

const H_ATTR_META_MAINKEYIDS = '$mainkey-ids';
const H_ATTR_META_SUBKEYIDS = '$subkey-ids';
export const H_ATTR_META = '$meta';


/** Decorator for Meta Attribute in a HomieItem */
export class Meta<TParent extends HomieBase<BaseAtrributes> | undefined,
    TAttributes extends BaseItemAtrributes> {

    public get $meta(): MetaAttributes {
        return this.item.attributes.meta || [];
    }

    constructor(private item: HomieItemBase<TParent, TAttributes>) {
    }

    public getMetaByKey(path: string[]): MetaKeyAttributes | MetaSubkeyAttributes | null {
        return getMetaByKey(path, this.$meta);
    }

    public setMeta(meta: MetaAttributes) {
        this.item.setAttribute('meta', meta);
    }



    public add(attrs: MetaKeyAttributes) {
        const found = this.getIndex(attrs.id);
        if (found === -1) {
            if (!attrs.subkeys) { attrs.subkeys = []; }
            this.setMeta([...this.$meta, attrs]);
        } else {
            this.updateAtIndex(found, attrs);
        }
    }


    protected removeAtIndex<T>(array: T[], index: number, replacement?: T): T[] {
        if (replacement === undefined) {
            return [...array.slice(0, index), ...array.slice(index + 1)];
        } else {
            return [...array.slice(0, index), replacement, ...array.slice(index + 1)];
        }
    }

    protected replaceAtIndex(index: number, attrs: MetaKeyAttributes) {
        this.setMeta(this.removeAtIndex(this.$meta, index, attrs))
    }

    public remove(id: string) {
        const index = this.getIndex(id);
        if (index === -1) { return; }
        this.setMeta(this.removeAtIndex(this.$meta, index))
    }

    public getIndex(id: string): number {
        for (let index = 0; index < this.$meta.length; index++) {
            const element = this.$meta[index];
            if (element.id === id) { return index };
        }
        return -1;
    }

    public getSubKeyIndex(parent: MetaKeyAttributes, id: string): number {
        if (!parent.subkeys) { return -1; }
        for (let index = 0; index < parent.subkeys.length; index++) {
            const element = parent.subkeys[index];
            if (element.id === id) { return index };
        }
        return -1;
    }

    public updateAtIndex(index: number, update: Partial<MetaKeyAttributes>) {
        const metaKey = this.$meta[index];
        if (update.subkeys) { // do not update subkeys
            const { subkeys, ...rest } = update;
            this.replaceAtIndex(index, { ...metaKey, ...rest })
        } else {
            this.replaceAtIndex(index, { ...metaKey, ...update })
        }
    }

    public updateSubKeyAtIndex(metaIndex: number, index: number, update: Partial<MetaSubkeyAttributes>) {
        const metaKey = this.$meta[metaIndex];
        if (metaKey.subkeys && index < metaKey.subkeys.length) {
            const subKey = metaKey.subkeys[index];
            this.replaceAtIndex(metaIndex, { ...metaKey, subkeys: this.removeAtIndex(metaKey.subkeys, index, { ...subKey, ...update }) })
        }
    }

    public addSubKey(parentId: string, attrs: MetaSubkeyAttributes) {
        const parentIndex = this.getIndex(parentId);
        if (parentIndex > -1) {
            const index = this.getSubKeyIndex(this.$meta[parentIndex], attrs.id);
            if (index === -1) {
                const updatedKey = { ...this.$meta[parentIndex], subkeys: [...this.$meta[parentIndex].subkeys || [], attrs] }
                this.replaceAtIndex(parentIndex, updatedKey)
            } else {
                this.updateSubKeyAtIndex(parentIndex, index, attrs)
            }
        } else {
            this.add({ id: parentId, subkeys: [attrs] });
        }
    }

    public removeSubKey(parentId: string, id: string) {
        const parentIndex = this.getIndex(parentId);
        if (parentIndex > -1) {
            const index = this.getSubKeyIndex(this.$meta[parentIndex], id);
            if (index === -1) { return }
            const subKeys = this.$meta[parentIndex].subkeys;
            if (subKeys) {
                const updatedKey = { ...this.$meta[parentIndex], subkeys: this.removeAtIndex(subKeys, index) }
                this.replaceAtIndex(parentIndex, updatedKey)
            }
        }
    }


    public parseMessage(deviceTokens: string[], value: string) {
        // return;
        if (deviceTokens[1] !== H_ATTR_META_MAINKEYIDS) {
            //  [0]     [1]       [2]       [3]
            // $meta/<mainKeyId>/?
            // $meta/<mainKeyId>/$key
            // $meta/<mainKeyId>/$value
            // $meta/<mainKeyId>/$subkey-ids
            // $meta/<mainKeyId>/<subkey-id>/$key
            // $meta/<mainKeyId>/<subkey-id>/$value
            const mainKeyId = deviceTokens[1];
            if (deviceTokens.length == 3) {
                if (deviceTokens[2].startsWith('$')) { // MainKey Attribute
                    const keyAttr = deviceTokens[2];
                    const dollarLessKeyAttr = keyAttr.substr(1)
                    if (keyAttr !== H_ATTR_META_SUBKEYIDS) {
                        const mainKeyIndex = this.getIndex(mainKeyId);
                        this.add({ id: mainKeyId, [dollarLessKeyAttr]: value });
                    }
                }
            } else if (deviceTokens.length === 4) {
                const subkeyId = deviceTokens[2];
                const keyAttr = deviceTokens[3];
                const dollarLessKeyAttr = keyAttr.substr(1)
                this.addSubKey(mainKeyId, { id: subkeyId, [dollarLessKeyAttr]: value })
            }
        }

    }



    public publish$(meta?: MetaAttributes): Observable<boolean> {
        const pubs: Observable<boolean>[] = [];
        const metaPub = meta === undefined ? this.$meta : meta;
        const mainKeyIds = []
        for (let mainKeyIndex = 0; mainKeyIndex < metaPub.length; mainKeyIndex++) {
            const mainKey = metaPub[mainKeyIndex];
            mainKeyIds.push(mainKey.id);

            mainKey.key && pubs.push(this.item.publish$(`$meta/${mainKey.id}/$key`, mainKey.key));
            mainKey.value && pubs.push(this.item.publish$(`$meta/${mainKey.id}/$value`, mainKey.value));

            const subKeyIds = [];
            if (mainKey.subkeys) {
                for (let subKeyIndex = 0; subKeyIndex < mainKey.subkeys?.length; subKeyIndex++) {
                    const subKey = mainKey.subkeys[subKeyIndex];
                    subKey.key && pubs.push(this.item.publish$(`$meta/${mainKey.id}/${subKey.id}/$key`, subKey.key));
                    subKey.value && pubs.push(this.item.publish$(`$meta/${mainKey.id}/${subKey.id}/$value`, subKey.value));
                    subKeyIds.push(subKey.id);
                }
            }
            if (subKeyIds.length > 0) {
                pubs.push(this.item.publish$(`$meta/${mainKey.id}/${H_ATTR_META_SUBKEYIDS}`, subKeyIds.join(',')));
            }
        }
        if (mainKeyIds.length > 0) {
            pubs.push(this.item.publish$(`$meta/${H_ATTR_META_MAINKEYIDS}`, mainKeyIds.join(',')));
        }
        return forkJoin(pubs).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no keys)
            map(results => results.indexOf(false) === -1)
        );

    }


    public wipe$(): Observable<boolean> {
        const pubs: Observable<boolean>[] = [];
        const metaWipe = this.$meta;
        const mainKeyIds = []
        for (let mainKeyIndex = 0; mainKeyIndex < metaWipe.length; mainKeyIndex++) {
            const mainKey = metaWipe[mainKeyIndex];
            mainKeyIds.push(mainKey.id);
            pubs.push(this.item.publish$(`$meta/${mainKey.id}/$key`, null, undefined, true));
            pubs.push(this.item.publish$(`$meta/${mainKey.id}/$value`, null, undefined, true));
            const subKeyIds = [];
            if (mainKey.subkeys) {
                for (let subKeyIndex = 0; subKeyIndex < mainKey.subkeys?.length; subKeyIndex++) {
                    const subKey = mainKey.subkeys[subKeyIndex];
                    pubs.push(this.item.publish$(`$meta/${mainKey.id}/${subKey.id}/$key`, null, undefined, true));
                    pubs.push(this.item.publish$(`$meta/${mainKey.id}/${subKey.id}/$value`, null, undefined, true));
                    subKeyIds.push(subKey.id);
                }
            }
            if (subKeyIds.length > 0) {
                pubs.push(this.item.publish$(`$meta/${mainKey.id}/${H_ATTR_META_SUBKEYIDS}`, null, undefined, true));
            }
        }
        if (mainKeyIds.length > 0) {
            pubs.push(this.item.publish$(`$meta/${H_ATTR_META_MAINKEYIDS}`, null, undefined, true));
        }
        return forkJoin(pubs).pipe(
            defaultIfEmpty([true]), // emit an array with a true element if forkjoin will complete without emitting (this is the case when there are no keys)
            map(results => results.indexOf(false) === -1)
        );
    }


}