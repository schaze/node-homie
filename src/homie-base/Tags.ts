import { distinctUntilChanged, map } from "rxjs/operators";
import { BaseAtrributes, BaseItemAtrributes } from "../model";
import { parseCSVString } from "../util";
import { HomieBase } from "./HomieBase";
import { HomieItemBase } from "./HomieItemBase";

/**
 *  Decoator for tags implementatation according Homie meta extension https://github.com/homieiot/convention/blob/develop/extensions/documents/homie_meta_extension.md
 * */
export class Tags<TParent extends HomieBase<BaseAtrributes> | undefined,
    TAttributes extends BaseItemAtrributes> {
    // @ts-ignore: 
    public tagsArr$ = this.item.attributes$.pipe(map(attrs => attrs.tags), distinctUntilChanged());
    public get tagsArr(): string[] {
        return this.item.attributes.tags || [];
    }

    public get $tags(): string {
        return this.tagsArr?.join(',');
    }
    public set $tags(value: string) {
        this.setTags(parseCSVString(value));
    }


    constructor(private item: HomieItemBase<TParent, TAttributes>) {
    }


    public setTags(tags: string[]) {
        this.item.setAttribute('tags', tags);
    }

    public add(tag: string): boolean {
        if (!this.tagsArr.includes(tag)) {
            this.setTags([...this.tagsArr, tag]);
            return true;
        }
        return false;
    }

    public addMany(tags: string[]) {
        tags.forEach(tag => this.add(tag));
    }

    public remove(tag: string): boolean {
        if (this.tagsArr === undefined || this.tagsArr?.length === 0) {
            return false;
        }
        const index = this.tagsArr.indexOf(tag);
        if (index > -1) {
            this.setTags([...this.tagsArr.slice(0, index), ...this.tagsArr.slice(index + 1)]);
            return true;
        }
        return false;
    }

}