import { Subject, Subscriber, Subscription, ObjectUnsubscribedError } from "rxjs";
import { EMPTY_SUBSCRIPTION } from "rxjs/internal/Subscription";
import { MqttMessage } from "./RxMQTT";

interface BufferEntry<T> {
    sequenceNo: number;
    data: T
}

interface TopicBuffer<T> {
    [topic: string]: BufferEntry<T>
}

/**
 * Removes an item from an array, mutating it.
 * @param arr The array to remove the item from
 * @param item The item to remove
 */
function arrRemove<T>(arr: T[] | undefined | null, item: T) {
    if (arr) {
        const index = arr.indexOf(item);
        0 <= index && arr.splice(index, 1);
    }
}

function sortBySequence<T>(a: BufferEntry<T>, b: BufferEntry<T>) {
    const aSeqNo = a.sequenceNo;
    const bSeqNo = b.sequenceNo;
    if (aSeqNo > bSeqNo) {
        return 1;
    }
    if (bSeqNo > aSeqNo) {
        return -1;
    }
    return 0;
}
/** @internal 
 * @description
 * This is a "copy" rxjs's ReplaySubject.
 * Stores messages for the same topic only once but in overall order.
 * Will emit the buffered messages upon subsicibe.
 * This mimics subscribing to multiple topics with wildcards for retained messages.
 * 
 * Note: All messages will be treated as retained, no matter if they were sent as retained or not.
*/
export class MqttReplaySubject extends Subject<MqttMessage>{
    private _buffer: TopicBuffer<MqttMessage> = {};
    private _squence = 0;

    constructor() {
        super();
    }

    override next(value: MqttMessage): void {
        const { isStopped, _buffer } = this;
        this._squence++;
        if (!isStopped) {
            _buffer[value.topic] = {
                sequenceNo: this._squence,
                data: { ...value, packet: { ...value.packet, retain: true } } // fake retained flag
            };
        }
        super.next(value);
    }

    /** @internal */
    protected _subscribe(subscriber: Subscriber<MqttMessage>): Subscription {
        this._throwIfClosed();

        const subscription = this._innerSubscribe(subscriber);

        const { _buffer } = this;
        // We use a copy here, so reentrant code does not mutate our array while we're
        // emitting it to a new subscriber.
        const listOfMessages = Object.values(_buffer).sort(sortBySequence);

        for (let i = 0; i < listOfMessages.length && !subscriber.closed; i++) {
            subscriber.next(listOfMessages[i].data);
        }

        this._checkFinalizedStatuses(subscriber);

        return subscription;
    }

    /** @internal */
    protected _throwIfClosed() {
        if (this.closed) {
            throw new ObjectUnsubscribedError();
        }
    }

    /** @internal */
    protected _checkFinalizedStatuses(subscriber: Subscriber<any>) {
        const { hasError, thrownError, isStopped } = this;
        if (hasError) {
            subscriber.error(thrownError);
        } else if (isStopped) {
            subscriber.complete();
        }
    }

    /** @internal */
    protected _innerSubscribe(subscriber: Subscriber<any>) {
        const { hasError, isStopped, observers } = this;
        return hasError || isStopped
            ? EMPTY_SUBSCRIPTION
            : (observers.push(subscriber), new Subscription(() => arrRemove(observers, subscriber)));
    }

}
