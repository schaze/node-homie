# node-homie
[![Node.js Package](https://github.com/schaze/node-homie/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/schaze/node-homie/actions/workflows/npm-publish.yml)

## tldr;
A typescript implementation of the homie 5.x convention leveraging rxjs to handle asynchronous message updates native to the mqtt based homie spec.

[![works with MQTT Homie](https://homieiot.github.io/img/works-with-homie.png)](https://homieiot.github.io/)


## Table of contents
- About
- Installation
- Usage as a controller
- Usage as device(s)
- General concepts
- Breaking changes (v4 → v5)
- References

## About

node-homie implements the [Homie 5.0 convention](https://homieiot.github.io/) for MQTT-based IoT device communication. It supports both **device mode** (publishing devices to MQTT) and **controller mode** (discovering and interacting with devices).

Key features:
- Full Homie 5.0 protocol support (single JSON `$description`, `$state`, `$target`, `$log`, `$alert`)
- All 9 datatypes: `integer`, `float`, `boolean`, `string`, `enum`, `color`, `datetime`, `duration`, `json`
- Reactive programming model using RxJS
- Device discovery and management
- Query-based property selection


## Installation

```bash
    # npm
    npm i node-homie

    # yarn
    yarn add node-homie

```


## Controller mode

### Discover devices

Discovering homie devices is pretty easy with node-homie. 
Node-homie offers components to discover and manage discovered devices.

```typescript

import { DeviceDiscovery, HomieDeviceManager } from "node-homie";
import { notNullish } from "node-homie/model";
import { combineLatest, distinctUntilChanged, filter, map, merge, Subject, switchMap, takeUntil } from "rxjs";
import { watchList } from 'node-homie/rx';


// create a Subject that will only get a value when the application should exit
// this is not specific to node-homie but will be used to auto-unsubscribe in later examples
const onDestroy$ = new Subject<boolean>();

// node-homie offers a device manager class that manages discovered devices and provides options to perform selection and queries
const devices = new HomieDeviceManager();

// create a device discovery that will take care of discovery new/existing/removed devices for us
const discovery = new DeviceDiscovery(
    {
        url: 'mqtt://localhost:1883',
        topicRoot: 'homie',          // optional set another homie root topic path (default: 'homie')
        username: undefined,         // mqtt username (optional)
        password: undefined,         // mqtt password (optional)
        reconnectPeriod: undefined,  // reconnect period on disconnect (optional)
    }
);

// subscribe to discovery events
discovery.events$.pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$)
).subscribe({
    next: event => {
        // new device was discovered
        if (event.type === 'add') {
            // if device ID is not already known...
            if (!devices.hasDevice(event.deviceId)) {
                // create a HomieDevice and add it to the devicemanager
                const device = devices.add(event.makeDevice());

                console.log('Discovered device: ', event.deviceId);

                // this will start the discovery of the complete device mqtt topic subtree
                // the DeviceDiscovery will actually only read in the ID of the device as metadata
                device!.onInit();
            }

        } else if (event.type === 'remove') {
            // remove and get the removed device ID from the devicemanager
            const device = devices.removeDevice(event.deviceId);
            // if the device was in the devicemanager
            if (device) {
                // clear out the object and disconnect from mqtt
                // note: this will not touch the device in the mqtt message bus (destroy only refers to the javascript object)
                device.onDestroy();
            }

        } else if (event.type === 'error') {
            console.log('Error discovering devices: ', event.error);
        }
    }
});

console.log('starting discovery...')
// start discovery
// discovery subscribes to {topicRoot}/5/+/$state to find devices
discovery.onInit();



// simulate application closure after 10 seconds
setTimeout(async () => {

    console.log('Closing down application')
    
    // this will cause all example subscriptions to unsubscribe (refer to takeUntil)
    onDestroy$.next(true);
    
    // stop and destroy discovery and devicemanager
    await discovery.onDestroy();
    await devices.onDestroy();
    
    console.log('Exiting application')
}, 10000);

```

### Get value of a property

#### Direct access
node-homie supports direct straight forward access to the property and its value in various ways.

```typescript

    // get temperature property for climate node of device leq0122770

    // Manual traversal via device -> node -> property
    // ==================================================
    const device = devices.getDevice('leq0122770');
    const node = device?.get('climate');
    const propManualTraversal = node?.get('temperature');
    console.log('Current temperature: ', propManualTraversal?.value);



    // direct property access via topic string selector
    // ==================================================
    const prop = devices.getProperty('leq0122770/climate/temperature');
    // if found print the properties current value
    console.log('Current temperature: ', prop?.value);




    // direct property access via object selector
    // ==================================================
    const propObjectSelector = devices.getProperty({
        deviceId: 'leq0122770',
        nodeId: 'climate',
        propertyId: 'temperature'
    });
    // if found print the properties current value
    console.log('Current Temperature: ', propObjectSelector?.value);

```

The problem with this approach is that homie and mqtt is by design an event/message based convention/protocol.
This means the above code will most likely result in an 'undefined' result as the property or its value might not yet be discovered/read from the mqtt message bus by the time the code is run.

You could wrap the call in a timeout and wait some time, to make sure the results are there - but this is no way to access homie values. Also it does not give you any updates when the value is changed.

```typescript

// don't do this - this is only for demonstration purposes
setTimeout(() => {

    // get temperature property for climate node of device leq0122770
    const prop = devices.getProperty('leq0122770/climate/temperature');
    // if found print the properties current value
    console.log('Current temperature: ', prop?.value);

}, 3000);

```

#### Selectors
To get a device/node/property or any of its attributes or values as soon as they are discovered or updated node-homie is implemented using reactive state patterns.
The below example shows the simplest case of selecting a property as soon as it discovered.

```typescript

// select temperature property for climate node of device leq0122770
devices.selectProperty('leq0122770/climate/temperature').pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$),
).subscribe({
    next: prop => {
        console.log('Property available: ', prop.pointer)
    }
})


```

The 'selectProperty' method returns an observable which can be subscribed to or used to further create a pipe to work with its results.

Having everything as an observable enables us to easily drill down further and subscribe to the properties value updates but only on non empty values and only when the value changes.


```typescript

// select temperature property for climate node of device leq0122770
devices.selectProperty('leq0122770/climate/temperature').pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$),
    // subscribe to value updates
    switchMap(property => property.value$),
    // filter out empty values
    filter(notNullish),
    // only update on temperature changes
    distinctUntilChanged()
).subscribe({
    next: temp => {
        console.log('Temperature update - current value: ', temp)
    }
})

```

#### Queries

Besides directly selecting single entities, node-homie also offers querying properties based on different input attributes.

Queries are updated upon any new or removed device and emit a list of properties matching the query input.


```typescript

// Query all properties below a climate node with id 'temperature'
devices.query({
    node: {
        id: 'climate'
    },
    property: {
        id: 'temperature'
    }
}).pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$)
).subscribe({
    next: poplist => {
        console.log('\nTemperature list: ');
        poplist.forEach(p => {
            console.log('Property: ', p.pointer, ' - ', p.value);
        });
    }
});


```

The above will emit multiple times during discovery whenever a change to the devices is made.

But what if we wanted to also be updated when any of the actual temperature values are changing? 
As an example we want to always display a list of all temperature properties whenever any temperature changes.

```typescript
// Query all properties below a climate node with id 'temperature'
// Subscribe to their value updates individually and emit a list of 
// all matched properties whenever any value of any matched property changes
devices.query({
    node: {
        id: 'climate'
    },
    property: {
        id: 'temperature'
    }
}).pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$),
    // filter out empty values
    filter(props => props.length > 0),
    // subscribe to value updates
    switchMap(props =>
        // combine latest values in a list of the following observables
        combineLatest(
            // map each property to its value$ observable
            props.map(prop =>
                // filter out empty and only update on changed values
                prop.value$.pipe(
                    // filter out empty values
                    filter(notNullish),
                    // only update on temperature changes
                    distinctUntilChanged(),
                    // in the end, map back to the property itself
                    map(value =>
                        prop
                    ))
            )
        )
    )
).subscribe({
    next: poplist => {
        console.log('\nTemperature list: ');
        poplist.forEach(p => {
            console.log('Property: ', p.pointer, ' - ', p.value);
        });
    }
});


```

The above examples requires a firmer knowledge of rxjs and its patterns.
To simplify the use a bit node-homie also comes with some rx operators that can be used achieve the same result as above with a bit less nested observable composition.

The `watchList` operator will take care of switching to inner subscriptions and combining observable outputs. Only a selector function needs to be provided that determines an update whenever it emits. In our case above this leaves only the property value$ observable pipe which is filtered for non empty and changed values.

```typescript

devices.query({
    node: {
        id: 'climate'
    },
    property: {
        id: 'temperature'
    }
}).pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$),
    // filter out empty values
    filter(props => props.length > 0),
    // subscribe to value updates
    watchList(
        prop => prop.value$.pipe(
            // filter out empty values
            filter(notNullish),
            // only update on temperature changes
            distinctUntilChanged()
        )
    )
).subscribe({
    next: poplist => {
        console.log('\nTemperature list: ');
        poplist.forEach(p => {
            console.log('Property: ', p.pointer, ' - ', p.value);
        });
    }
});

```

# Device mode
With node-homie you can also manage and publish a device to mqtt.

Each device will hold its own mqtt connection (this is required by the spec due to the last will and testament requirement).

There are 3 main classes representing the different homie topology elements (device, node, property):
- HomieDevice
- HomieNode
- HomieProperty


## Create device, node, property and publish values

```typescript

// Create a device 'my-homie-device'
const myDevice = new HomieDevice({ id: 'my-homie-device', name: 'My demo homie device' }, MqttOpts);

// Add a sensor node to it
const sensorNode = myDevice.add(new HomieNode(myDevice, { id: 'sensors', name: 'Virtual sensor array', type: 'special-sensor' }));

// Add a temperature property to the sensor node
const tempSensorProp = sensorNode.add(new HomieProperty(sensorNode, {
    id: 'temperature',
    name: 'Current temperature',
    datatype: HOMIE_TYPE_FLOAT,
    retained: true,
    settable: false,
    unit: `°C`
}));

// Add an actor node
const actorNode = myDevice.add(new HomieNode(myDevice, { id: 'actor', name: 'Virtual actor node', type: 'special-actor' }));

// Add a virtual switch property to the actor node
const switchProp = actorNode.add(new HomieProperty(actorNode, {
    id: 'switch',
    name: 'Virtual switch',
    datatype: HOMIE_TYPE_BOOL,
    retained: true,
    settable: true
}));
switchProp.value = 'false';


// Set the property value.
// Please note: Values are always Strings! There are helper functions for conversions.
tempSensorProp.value = String(21.4);

// Initialize Device (this will publish the above node and property element to mqtt)
// any value update after this init will also be directly published to mqtt
myDevice.onInit();


// When done with the device (disconnect) call
myDevice.onDestroy();

```
Any changes to the device, nodes or properties after onInit (also [see Lifecycle concept](#node-homie-object-lifecycle-concept)) will be published directly to mqtt. Before onInit nothing gets published yet. If you do changes to the node or property structure after onInit please ensure to set the device state to 'init' first to follow convention.

Calling onDestroy (also [see Lifecycle concept](#node-homie-object-lifecycle-concept)) will set the device's state to 'disconnected' in mqtt and close the mqtt connection.


`onInit` in the above example will publish the following messages on mqtt:
```
homie/5/my-homie-device/$state              init

homie/5/my-homie-device/$description        {"homie":"5.0","name":"My demo homie device","version":1681234567890,"nodes":{"sensors":{"name":"Virtual sensor array","type":"special-sensor","properties":{"temperature":{"name":"Current temperature","datatype":"float","retained":true,"settable":false,"unit":"°C"}}},"actor":{"name":"Virtual actor node","type":"special-actor","properties":{"switch":{"name":"Virtual switch","datatype":"boolean","retained":true,"settable":true}}}}}

homie/5/my-homie-device/sensors/temperature 21.4
homie/5/my-homie-device/actor/switch        false

homie/5/my-homie-device/$state              ready
```

Key differences from Homie v4:
- Topics include a `/5/` version segment: `{topicRoot}/5/{device-id}/...`
- All device/node/property metadata is published as a single JSON document on `$description` (no more individual `$name`, `$datatype`, `$nodes`, `$properties` topics)
- Only `$state` and property values remain as separate topics


## Handle 'set' messages for devices

If you want to react on 'set' messages for the above virtual switch, you can subscribe to its onSetMessage$ observable.

```typescript

switchProp.onSetMessage$.pipe(
    takeUntil(switchProp.onDestroy$)
).subscribe({
    next: event => {
        const prop = event.property;        // the property for which the set was called - will be switchProp in this case
        const value = event.value;          // the parsed and typed value of the set call (`true` or `false`) for this property
        const valueStr = event.valueStr;    // the string value that was actually received 'true' or 'false' for this property

        console.log(`Switch was requested to be turned to ${value}`);

        prop.value = valueStr; // update the actual state of the property with the requested value;
    }
});


```

Please note that you will need to update the property's state yourself (or decide not do so if there are other circumstances).

To test the above code we can publish a 'true' value to the switch property's set topic:

```typescript

mqtt.publish$('homie/5/my-homie-device/actor/switch/set', 'true').subscribe();

```

This will output the following and set the property's value to true:

```
2021-12-29T12:29:07.777Z info [:HomieProperty:switch]: homie/5/my-homie-device/actor/switch - Property SET command
Switch was requested to be turned to true
```


## $target support

Properties support a `$target` attribute for intermediate state updates. This is useful when a property is transitioning to a new value (e.g. a dimmer ramping up).

```typescript

// In device mode: publish a target value
await lastValueFrom(myProperty.publishTarget$('75'));

// In controller mode: observe target changes
myProperty.target$.pipe(
    takeUntil(onDestroy$)
).subscribe({
    next: target => {
        console.log('Target value: ', target);
    }
});

```


## $log and $alert support

Devices can publish log messages and alerts:

```typescript

// In device mode: publish a log message (non-retained, QoS 1)
await lastValueFrom(myDevice.publishLog$('info', 'Sensor calibration complete'));

// In device mode: publish an alert (retained, QoS 2)
await lastValueFrom(myDevice.publishAlert$('sensor-fault', 'Temperature sensor not responding'));

// In device mode: clear an alert
await lastValueFrom(myDevice.clearAlert$('sensor-fault'));

// In controller mode: observe log events
myDevice.logEvent$.pipe(
    takeUntil(onDestroy$)
).subscribe({
    next: event => {
        console.log(`[${event.level}] ${event.message}`);
    }
});

// In controller mode: observe alert events
myDevice.alertEvent$.pipe(
    takeUntil(onDestroy$)
).subscribe({
    next: event => {
        console.log(`Alert ${event.alertId}: ${event.message}`);
    }
});

// In controller mode: get current active alerts
myDevice.alerts$.pipe(
    takeUntil(onDestroy$)
).subscribe({
    next: alerts => {
        alerts.forEach((message, alertId) => {
            console.log(`Active alert: ${alertId} - ${message}`);
        });
    }
});

```



# General concepts

## Logging
Node-homie implements its own simple logger class. 

`import {SimpleLogger, LogLevels } from 'node-homie/misc';`

You can configure global logging settings on the class attribute loglevel of the SimpleLogger.

```typescript
// only log error messages
SimpleLogger.loglevel = LogLevels.error;

// set logger domain
SimpleLogger.domain = "my-app";
```


Log output by default is formatted the following way:
```typescript
console.log(`${(new Date()).toISOString()} ${LogLevelName[level < LogLevelName.length ? level : LogLevelName.length - 1]} [${domain}:${type}:${name}]: ${text}`, obj);
```
This will result in the following messages:
`<timestamp> <loglevel> [<domain>:<type>:<name>]: <message>`

e.g.:
`2021-12-29T12:29:07.777Z info [my-app:HomieProperty:switch]: test log message `


To integrate node-homie's SimpleLogger in the logging solution of your choice you can also override the `SimpleLogger.logOutput` method to bridge to your logging library or also change the logoutput format.

For example to link with winston logging library:

```typescript

const myLogformat = winston.format.printf((info) => {
  return `${info['timestamp']} ${info.level} [${info['service']}:${info['type']}${info['name'] ? `:${info['name']}` : ''}]: ${info.message}` + ((Object.keys(info['args']).length > 0) ? inspect(info['args'], { showHidden: false, depth: null }) : '');
});

winston.configure({
  level: LOGLEVEL,
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.splat(),
    winston.format.metadata({ key: 'args', fillExcept: ['service', 'type', 'name', 'level', 'message'] }),
    winston.format.timestamp(),
    myLogformat,
  ),
  defaultMeta: { service: 'my-app' },
  transports: [
    new winston.transports.Console(),
  ],
});

const log = winston.child({
  type: 'node-homie',
});

SimpleLogger.logOutput = (domain: string, type: string, name: string, logLevel: number, level: number, text: string, obj?: any) => {
  if (obj) {
    log.log(LogLevelName[level], text, { service: domain, type, name, obj});
  }else{
    log.log(LogLevelName[level], text, { service: domain, type, name});
  }
}
```


## Node-homie object lifecycle concept
Node-homie borrows from angular's lifecycle method concept.

All node-homie objects implement the following 2 lifecycle interfaces:

```typescript

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
     * Called before an Object is destroyed. All resources, listeners, etc should be cleaned up here.
     * @returns Promise in case of async destruction
     */
    onDestroy(): Promise<void>;
}

```

These methods need to be called for all objects to take care of their lifecycle. 
OnInit will start connections (e.g. to mqtt) or other active parts of the object and allocate data. With onDestroy connections will be closed and data freed.
Please note both are async methods (Promise based) so you can also actually `await` on their completion.


# Breaking changes (v4 → v5)

This version implements the Homie 5.0 convention and contains several breaking changes from the previous v4-based releases.

## Topic structure
- v4: `{topicRoot}/{device-id}/$homie`, `{topicRoot}/{device-id}/$name`, ...
- v5: `{topicRoot}/5/{device-id}/$state`, `{topicRoot}/5/{device-id}/$description`, `{topicRoot}/5/{device-id}/{node}/{prop}`

All topics now include a `/5/` version segment after the topic root.

## Device description
- v4: Each attribute (`$name`, `$datatype`, `$nodes`, `$properties`, etc.) published as separate retained MQTT topics
- v5: Single JSON document published on `$description` topic. Only `$state` and property values remain as separate topics.

## New features
- `json` datatype added
- `$target` property support for intermediate state updates
- `$log/{level}` topic for device logging (non-retained, QoS 1)
- `$alert/{alert_id}` topic for alerts (retained, QoS 2)
- `alert` device state
- Device hierarchy: `root`, `parent`, `children` fields
- `type` field on device description
- `version` field in description (timestamp, must change on updates)

## Removed from v4
- Individual `$name`, `$datatype`, `$format`, `$settable`, `$retained`, `$unit` topics per property
- `$nodes`, `$properties` attribute topics
- `$fw/*`, `$implementation/*`, `$stats/*` attributes
- Tags/meta concept (now via extension)

## API changes
- `setAttributes()` → `patchAttributes()` — for partial attribute updates
- `addInitNode()` → `add()` — nodes are added synchronously before `onInit()`
- `HomieProperty.parent` → `HomieProperty.node` — accessor for parent node
- `DeviceDiscovery` constructor no longer takes a boolean parameter
- Model type renames: `BaseItemAttributes` → `BaseAttributes`, `HomieNodeAttributes` → `NodeAttributes`, `HomiePropertyAttributes` → `PropertyAttributes`


# References
- Core class architecture was inspired by the excellent library https://github.com/chrispyduck/homie-device 
- Homie convention: https://homieiot.github.io/
