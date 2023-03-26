import { distinctUntilChanged, filter, map, Subject, switchMap, takeUntil } from "rxjs";
import { DeviceDiscovery } from "./DeviceDiscovery";
import { HomieDeviceManager } from "./DeviceManager";
import { HomieDevice } from "./HomieDevice";
import { HomieNode } from "./HomieNode";
import { node$, property$, onSetMessage$, nodeAttrs$, propAttrs$, device$, value$, deviceAttrs$, state$ } from "./HomieRx";
import { DeviceAttributes, DeviceDescription, DeviceQuery, HomieDeviceMode, HomieID, NodeAttributes, notNullish, RXObjectAttributes, ToRXObjectAttributes, ZERO_STRING } from "./model";
import { RxMqtt } from "./mqtt";
import { query, queryDevices, queryNodes, queryRXObjects } from "./Query";
import { isNotNullish } from "./rx";
import { RXObject } from "./RXObject";
import { selectDevice } from "./Selector";

const onDestroy$ = new Subject<boolean>();

const desc = require('./test.json');

async function test_Memory(device: HomieDevice, desc: DeviceDescription): Promise<void> {
    console.time("Compares")
    for (let index = 0; index < 2000; index++) {
        await device.updateFromDescription(<DeviceDescription>{
            version: 100,
            homie: "5.0",
            "extensions": [
                "eu.epnw.meta:1.1.0:4.0"
            ],
            "name": "wz_stehlampe_papier",
            nodes: {
                colorlight: {
                    name: "colorlight",
                    type: "",
                    properties: {
                        text: {
                            datatype: "string",
                            retained: true,
                            settable: true
                        },
                        color: {
                            datatype: "boolean",
                            settable: true
                        },
                        "color-temperature": {
                            "name": "Color Temperature",
                            "settable": true,
                            "format": "153:555",
                            "unit": "Mired",
                            "datatype": "integer"
                        }
                    }
                }
            }
        })

        await device.updateFromDescription(desc);
    }
    console.timeEnd("Compares");

}

async function test_Publish() {

    console.log(`${!!"z"} ==> ${ZERO_STRING.length}`)

    const device = HomieDevice.fromDescription('test-device', desc, {
        url: process.env['MQTT_URL']!,
        topicRoot: process.env['MQTT_TOPICROOT'] || 'homie5-dev',
        username: process.env['MQTT_USERNAME'],
        password: process.env['MQTT_PASSWORD'],
    }, HomieDeviceMode.Device
    )
    // device.nodes['switch'].properties['text'].descriptionUpdateNeeded

    device.nodes$.pipe(node$('switch'), property$('text'), onSetMessage$()).pipe(takeUntil(device.onDestroy$)).subscribe({
        next: msg => {
            msg.property.value = msg.valueStr;
        }
    })

    device.nodes$.pipe(node$('switch'), nodeAttrs$()).pipe(takeUntil(device.onDestroy$)).subscribe({
        next: d => {
            console.log('NodeAttrs: ', d);
        }
    })

    device.nodes$.pipe(node$('switch'), property$('state'), propAttrs$()).pipe(takeUntil(device.onDestroy$)).subscribe({
        next: d => {
            console.log('PropertyAttrs: ', d);
        }
    })

    await device.onInit()
    return device;
}

async function test_Discover() {
    const d = new HomieDevice({id: "hi"},{
        url: process.env['MQTT_URL']!,
        topicRoot: process.env['MQTT_TOPICROOT'] || 'homie5-dev',
        username: process.env['MQTT_USERNAME'],
        password: process.env['MQTT_PASSWORD'],
    } );
    d.add(new HomieNode(d, {id: "t"}));

    const sharedMqtt = new RxMqtt({
        url: process.env['MQTT_URL']!,
        topicRoot: process.env['MQTT_TOPICROOT'] || 'homie5-dev',
        username: process.env['MQTT_USERNAME'],
        password: process.env['MQTT_PASSWORD'],
    })
    const dm = new HomieDeviceManager();

    const discovery = new DeviceDiscovery({
        url: process.env['MQTT_URL']!,
        topicRoot: process.env['MQTT_TOPICROOT'] || 'homie5-dev',
        username: process.env['MQTT_USERNAME'],
        password: process.env['MQTT_PASSWORD'],
    }, sharedMqtt);
    discovery.events$.pipe(takeUntil(discovery.onDestroy$)).subscribe({
        next: async event => {
            if (event.type === "add") {

                if (!dm.hasDevice(event.deviceId)) {
                    // console.log("Discovered device: ",event.deviceId);
                    const d = event.makeDevice();
                    await d.onInit();
                    dm.add(d);
                }
            }
        }
    });

    selectDevice(dm.devices$, 'group-2').pipe(takeUntil(onDestroy$)).subscribe({
        next: d => {
            console.log("Selected device: ", d.attributes.name, d.pointer);
        }
    });

    dm.devices$.pipe(device$('group-2'), deviceAttrs$(), filter(attrs => attrs.name !== undefined), distinctUntilChanged(), takeUntil(onDestroy$)).subscribe({
        next: attributes => {
            console.log("Selected device Name: ", attributes.name);
        }
    });

    dm.devices$.pipe(device$('group-2'), state$(), distinctUntilChanged(), takeUntil(onDestroy$)).subscribe({
        next: state => {
            console.log("State of group-2: ", state);
        }
    });

    dm.devices$.pipe(device$('group-2'), node$('switch'), property$('state'), distinctUntilChanged(), value$(), takeUntil(onDestroy$)).subscribe({
        next: d => {
            console.log("Value of state property: ", d);
        }
    });

    onDestroy$.subscribe({
        next: async _ => {
            await discovery.onDestroy();
            await dm.onDestroy();
            await sharedMqtt.onDestroy();
        }
    })

    setTimeout(()=>{
        console.log("Querying...")
        query(dm.devices$, {
           device:{
                state: {
                    operator: '=',
                    value: "ready"
                }
           },
           property: {
            id: "state"
           }
        } ,3000).pipe(takeUntil(onDestroy$)).subscribe({
            next: objs => {
                console.log(`${objs.length} objects found: `, objs.map(obj => ({ ...obj.attributes, device: obj.device.id })));
    
            }
        })
    }, 3000)



    await discovery.onInit();
}


async function test_Value(device: HomieDevice) {
    console.log("Updating value");
    device.nodes['switch'].properties['text'].value = ""
}

async function test_Query() {



}

async function test_Update(device: HomieDevice) {

    console.log("Device: ");
    console.dir(device.getDescription(), { depth: null });
    console.log("JSON: ", JSON.stringify(device.getDescription(), undefined, " "));

    // device.attributes$.pipe(map(a => a.children), distinctUntilChanged()).subscribe({
    //     next: (c) => {
    //         // console.log("Children: ", c);
    //     }
    // });

    // device.attributes$.pipe(map(a => a.extensions), distinctUntilChanged()).subscribe({
    //     next: (c) => {
    //         // console.log("Extensions: ", c);
    //     }
    // });

    // device.attributes$.pipe(map(a => a.name), distinctUntilChanged()).subscribe({
    //     next: (c) => {
    //         // console.log("Name: ", c);
    //     }
    // });

    // device.node$('colorlight').pipe(switchMap(node=>node.attributes$)).subscribe({
    //     next: (c) => {
    //         // console.log("NODE: ", c);
    //     }
    // });

    // device.node$('colorlight').pipe(switchMap(node=>node.property$('color')),distinctUntilChanged(), switchMap(prop => prop.attributes$), distinctUntilChanged()).subscribe({
    //     next: (c) => {
    //         // console.log("PROP: ", c);
    //     }
    // });

    device.deviceChangeTransactionAsync(async () => {
        await device.updateFromDescription(<DeviceDescription>{
            version: 100,
            homie: "5.0",
            "extensions": [
                "eu.epnw.meta:1.1.0:4.0"
            ],
            "name": "wz_stehlampe_papier",
            nodes: {
                colorlight: {
                    name: "colorlight",
                    properties: {
                        color: {
                            datatype: "boolean",
                            settable: true
                        },
                        "color-temperature": {
                            "name": "Color Temperature",
                            "settable": true,
                            "format": "153:555",
                            "unit": "Mired",
                            "datatype": "integer"
                        }
                    }
                }
            }
        })
        return false;

    });



    console.log("Device: ");
    console.dir(device.getDescription(), { depth: null });
    console.log("JSON: ", JSON.stringify(device.getDescription(), undefined, " "));

}


async function main() {
    const device = await test_Publish();
    console.log("Published");
    await test_Discover();
    await test_Value(device);
    // await asyncTimeout(2000);
    // await test_Update(device);
    // await test_Memory(device, desc);
    console.log("Completed");
    return device
}

if (require.main === module) {
    const wait = 200000;
    main().then((device) => {

        setTimeout(() => {
            console.log("\n\nDESTROYING\n")
            onDestroy$.next(true);
            device.onDestroy();
        }, wait);


        setTimeout(() => {
            console.log("waiting 5 seconds before exiting");
            onDestroy$.complete();
            process.exit(0);
        }, wait + 5000);
    }
    )
}



