import { BehaviorSubject, Observable } from "rxjs";
import { LifecycleBase, SimpleLogger } from "./misc";
import { RXObjectAttributes } from "./model";
import { arraysAreEqual } from "./util";


export class RXObject<TAttributes extends RXObjectAttributes = RXObjectAttributes> extends LifecycleBase {
    
    protected readonly _attributes$: BehaviorSubject<TAttributes>;
    public readonly attributes$: Observable<TAttributes>;
    protected set attributes(value: TAttributes) {
        this._attributes$.next(value);
    }
    public get attributes(): TAttributes {
        return this._attributes$.value;
    }


    constructor(attrs: TAttributes) {
        super();
        this._attributes$ = new BehaviorSubject<TAttributes>(attrs);
        this.attributes$ = this._attributes$.asObservable();
    }

    public async onInit() { }

    public setAttribute<T extends keyof TAttributes>(name: T, value: TAttributes[T] | null | undefined, onlyIfChanged = true) {
        if (onlyIfChanged && this.attributes[name] === value) { return; }
        this.attributes = { ...this.attributes, [name]: value };
    }

    public patchAttributes(attrs: Partial<TAttributes>) {
        this.attributes = { ...this.attributes, ...attrs };
    }

    public updateAttributes(update: TAttributes) {
        const updatedArrays = {} as any;
        let changed = false;
        let id: keyof TAttributes;

        // check if there are changed attribute in update compared to current attributes
        // arrays are collected as to make sure that these are not replaced by new arrays with equal content
        // as it is unknonwn how many arrays are in the object all attributes have to be traversed
        for (id in update) {
            if (Object.prototype.hasOwnProperty.call(update, id)) {

                const currentElement = this.attributes[id];
                const updatedElement = update[id];

                if (Array.isArray(updatedElement)) {
                    if (!arraysAreEqual(currentElement as unknown as [], updatedElement)) {
                        updatedArrays[id] = updatedElement;
                        changed = true;
                    } else {
                        updatedArrays[id] = currentElement;
                    }
                } else {
                    if (currentElement !== updatedElement) {
                        changed = true;
                    }
                }

            }
        }

        // to check for removed optional properties another iteration of the current attributes is needed.
        // this can however be stopped as soon as a missing property is found.
        for (id in this.attributes) {
            if (Object.prototype.hasOwnProperty.call(this.attributes, id)) {
                if (!Object.prototype.hasOwnProperty.call(update, id)) {
                    changed = true;
                    break;
                }
            }
        }

        // if the object was changed update attributes and merge with the arrays to preseve unchanged arrays
        if (changed) {
            this.attributes = { ...update, ...updatedArrays };
        }
    }


}

