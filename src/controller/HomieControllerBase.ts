import { firstValueFrom, lastValueFrom, Subject } from "rxjs";
import { LifecycleBase, OnDestroy, OnInit } from "../misc";
import { HomieID } from "../model";
import { MQTTConnectOpts } from "../model";
import { HomieDevice } from "../HomieDevice";
import { takeUntil } from "rxjs/operators";
import { SimpleLogger } from "../misc/Logger";
import { waitForPreviousControllerDown$ } from "./controller";

// if not specified set a timeout of 5 seconds for the old controller to shutdown
export const DEFAULT_INIT_TIMEOUT = 5000;

export class HomieControllerBase extends LifecycleBase {
    protected readonly log: SimpleLogger;

    protected controllerDevice: HomieDevice;
    protected controllerDeviceInitTimeout: boolean = false;

    constructor(protected id: HomieID, protected name: string, protected mqttOpts: MQTTConnectOpts, protected initTimeout = DEFAULT_INIT_TIMEOUT) {
        super();
        this.log = new SimpleLogger(this.constructor.name, this.id);
        this.controllerDevice = new HomieDevice({ id: this.id, name: this.name }, this.mqttOpts);
    }

    async onInit(): Promise<void> {
        this.log.verbose('Waiting until old controller is down...');
        this.controllerDeviceInitTimeout = await lastValueFrom(waitForPreviousControllerDown$(this.id, this.mqttOpts, this.initTimeout).pipe(takeUntil(this.onDestroy$)), { defaultValue: true });
    }


}