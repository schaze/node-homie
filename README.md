# node-homie


## tldr;
A typescript implementation of the homie 4.x convention leveraging rxjs to handle asynchronous message updates native to the mqtt based homie spec.

Homie convention: https://homieiot.github.io/
<a href="https://homieiot.github.io/">
  <object type="image/svg+xml" data="https://homieiot.github.io/img/works-with-homie.svg">
    works with MQTT Homie
  </object>
</a>

## Table of contents
- About
- Installation
- Usage as a controller
- Usage as device(s)
- Genereal concepts
- References

## About

tbd....


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
// this is not specific to node-hoie but will be used to auto-unsubscribe in later examples
const onDestroy$ = new Subject<boolean>();

// node-homie offers a device manager class that manages discovered devices and provides options to perform selection and queries
const devices = new HomieDeviceManager();

// create a device discovery that will take care of discovery new/existing/removed devices for us
const discovery = new DeviceDiscovery(
    {
        url: 'mqtt://localhost:1883',
        topicRoot: 'homie-dev',     // optional set another homie root topic path
        username: undefined,        // mqtt username (optional)
        password: undefined,        // mqtt password (optional)
        reconnectPeriod: undefined, // reconnect period on disconnect (optional)
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
                // note: this will not touch the device in the mqtt message bus (destroy only referes to the javascript object)
                device.onDestroy();
            }

        } else if (event.type === 'error') {
            console.log('Error discovering devices: ', event.error);
        }
    }
});

console.log('starting discovery...')
// start discovery
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

    // get temperature property for weather node of device leq0122770

    // Manual traversal via device -> node -> property
    // ==================================================
    const device = devices.getDevice('leq0122770');
    const node = device?.get('weather');
    const propManualTraversal = node?.get('temperature');
    console.log('Current temperature: ', propManualTraversal?.value);



    // direct property access via topic string selector
    // ==================================================
    const prop = devices.getProperty('leq0122770/weather/temperature');
    // if found print the properties current value
    console.log('Current temperature: ', prop?.value);




    // direct property access via object selector
    // ==================================================
    const propObjectSelector = devices.getProperty({
        deviceId: 'leq0122770',
        nodeId: 'weather',
        propertyId: 'temperature'
    });
    // if found print the properties current value
    console.log('Current Temperature: ', propObjectSelector?.value);

```

The problem with this approach is that homie and mqtt is by design an event/message based convention/protocol.
This means the above code will most likely result in an 'undefined' result as the property or its value might not yet be discovered/read from the mqtt message bus by the time the code is run.

You could wrap the call in a timeout and wait some time, to make sure the results are there - but this is no way to access homie values. Also it does not give you any updates when the value is changed.

```typescript

// don´t do this - this is only for demonstration purposes
setTimeout(() => {

    // get temperature property for weather node of device leq0122770
    const prop = devices.getProperty('leq0122770/weather/temperature');
    // if found print the properties current value
    console.log('Current temperature: ', prop?.value);

}, 3000);

```

#### Selectors
To get a device/node/property or any of its attributes or values as soon as they are discovered or updated node-homie is implemented using reactive state patterns.
The below example shows the simplest case of selecting a property as soon as it discovered.

```typescript

// select temperature property for weather node of device leq0122770
devices.selectProperty('leq0122770/weather/temperature').pipe(
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

// select temperature property for weather node of device leq0122770
devices.selectProperty('leq0122770/weather/temperature').pipe(
    // unsubsribe on application exit
    takeUntil(onDestroy$),
    // subscribe to value updates
    switchMap(property => property.value$),
    // filter out empty values
    filter(notNullish),
    // only update on temperatue changes
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

// Query all properties below a weather node with id 'temperature'
devices.query({
    node: {
        id: 'weather'
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
// Query all properties below a weather node with id 'temperature'
// Subscribe to their value updates indiviually and emit a list of 
// all matched properties whenever any value of any matched property changes
devices.query({
    node: {
        id: 'weather'
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
                    // only update on temperatue changes
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

The `watchList` operator will take care of switching to inner subscriptions and combining observable outputs. Only a selector function needs to be provided that determines an update whever it emits. In out case above this leaves only the property value$ observable pipe which is filtered for non empty and changed values.

```typescript

devices.query({
    node: {
        id: 'weather'
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
            // only update on temperatue changes
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

Each device will hold it's own mqtt connection (this is required by the spec due the last will and testament reuirement).

There are 3 main classes representing the different homie topology elements (device, node, property);
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
const swithProp = actorNode.add(new HomieProperty(actorNode, {
    id: 'switch',
    name: 'Virtual switch',
    datatype: HOMIE_TYPE_BOOL,
    retained: true,
    settable: true
}));
swithProp.value = 'false';


// Set the property value.
// Please note: Values are always Strings! There are helper functions for conversions.
tempSensorProp.value = String(21.4);

// Initialize Device (this will publish the above node and property element to mqtt)
// any value update after this init will also be directly published to mqtt
myDevice.onInit();


// When done with the device (disconnect) call
myDevice.onDestroy();

```
Any changes to the device, nodes or properties after onInit (also [see Lifecycle concep](#node-homie-object-lifecycle-concept)) will be published directly to mqtt. Before onInit nothing gets published yet. If you do changes to the node or property structure after onInit please ensure to set the device state to 'init' first to follow convetion.

Calling onDestroy (also [see Lifecycle concept](#node-homie-object-lifecycle-concept)) will set the devices state to 'disconnected' in mqtt and close the mqtt connection.


`onInit` in the above example will publish the following messages on mqtt:
```
homie-dev/my-homie-device/$state init

homie-dev/my-homie-device/$name My demo homie device
homie-dev/my-homie-device/$homie 4.0.0
homie-dev/my-homie-device/$extensions eu.epnw.meta:1.1.0:4.0
homie-dev/my-homie-device/$nodes sensors,actor

homie-dev/my-homie-device/sensors/$name Virtual sensor array
homie-dev/my-homie-device/sensors/$type special-sensor
homie-dev/my-homie-device/sensors/$properties temperature

homie-dev/my-homie-device/sensors/temperature 21.4
homie-dev/my-homie-device/sensors/temperature/$settable false
homie-dev/my-homie-device/sensors/temperature/$retained true
homie-dev/my-homie-device/sensors/temperature/$name Current temperature
homie-dev/my-homie-device/sensors/temperature/$datatype float
homie-dev/my-homie-device/sensors/temperature/$unit °C

homie-dev/my-homie-device/actor/$name Virtual actor node
homie-dev/my-homie-device/actor/$type special-actor
homie-dev/my-homie-device/actor/$properties switch

homie-dev/my-homie-device/actor/switch/$settable true
homie-dev/my-homie-device/actor/switch/$retained true
homie-dev/my-homie-device/actor/switch/$name Virtual switch
homie-dev/my-homie-device/actor/switch/$datatype boolean

homie-dev/my-homie-device/$state ready
```


## Handle 'set' messages for devices

If you want to react on 'set' messages for the above virtual switch, you can subscribe to its onSetMessage$ observable.

```typescript

swithProp.onSetMessage$.pipe(
    takeUntil(swithProp.onDestroy$)
).subscribe({
    next: event => {
        const prop = event.property;        // the property for which the set was called - will be swtichProp in this case
        const value = event.value;          // the parsed and typed value of the set call (`true` or `false`) for this property
        const valueStr = event.valueStr;    // the string value that was actually received 'true' or 'false' for this property

        console.log(`Switch was requested to be turned to ${value}`);

        prop.value = valueStr; // update the actual state of the property witht he requested value;
    }
});


```

Please note that you will need to update the properties state yourself (or decide not do so if there are other circumstances).

To test the above code we can publish a 'true' value to the switch property's set topic:

```typescript

mqtt.publish$('homie-dev/my-homie-device/actor/switch/set', 'true').subscribe();

```

This will output the following and set the properties value to true;

```
2021-12-29T12:29:07.777Z info [:HomieProperty:switch]: homie-dev/my-homie-device/actor/switch - Property SET command
Switch was requested to be turned to true
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


To integrate node-homies SimpleLogger in the logging solution of your choice you can also override the `SimpleLogger.logOutput` method to bridge to your logging library or also change the logoutput format.

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
Node-homie borrows from angulars lifecylce method concept

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
     * Called before an Object is destroyed. All ressources, listeners, etc should be cleanup here.
     * @returns Promise in case of async destrution
     */
    onDestroy(): Promise<void>;
}

```

These methods need to be called for all objects to take care of their lifecycle. 
OnInit will start connections (e.g. to mqtt) or other active parts of the object an allocate data. With onDestroy connections will be closed and data freed.
Please note both are async methods (Promise based) so you can also actually `await` on their completion.




# Refrecences
- Core class architecture was inspired by the excellent library https://github.com/chrispyduck/homie-device 
- Homie comvention: https://homieiot.github.io/