import { Subject } from "rxjs";

/**
 * Implement a generic onInit method to perform initialization
 */
export interface OnInit {
    /**
     * Called after object creation to initialize active content.
     * @returns Promise in case of async initialization
     */
    onInit(): Promise<void>;
}

/**
 * Implement a generic onDestroy method to perform cleanup
 */
export interface OnDestroy {
    /**
     * Called before an Object is destroyed. All ressources, listeners, etc should be cleanup here.
     * @returns Promise in case of async destrution
     */
    onDestroy(): Promise<void>;
}

export abstract class LifecycleBase implements OnInit, OnDestroy {
    protected _onDestroy$ = new Subject<boolean>();
    public onDestroy$ = this._onDestroy$.asObservable();

    abstract onInit(): Promise<void>;

    async onDestroy(): Promise<void> {
        this._onDestroy$.next(true);
    }
}