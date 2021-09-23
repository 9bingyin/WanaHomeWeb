import {
    EventMap,
    EventType,
    IOverlayHandler,
    OverlayHandlerFuncs,
    OverlayHandlerTypes,
} from './event';

declare global {
    interface Window {
        __OverlayCallback: EventMap[EventType];
        dispatchOverlayEvent?: typeof processEvent;
        OverlayPluginApi: {
            ready: boolean;
            callHandler: (msg: string, cb?: (value: string) => unknown) => void;
        };
        /**
         * @deprecated This is for backward compatibility.
         *
         * It is recommended to import from this file:
         *
         * `import { addOverlayListener } from '/path/to/overlay_plugin_api';`
         */
        addOverlayListener: IAddOverlayListener;
        /**
         * @deprecated This is for backward compatibility.
         *
         * It is recommended to import from this file:
         *
         * `import { removeOverlayListener } from '/path/to/overlay_plugin_api';`
         */
        removeOverlayListener: IRemoveOverlayListener;
        /**
         * @deprecated This is for backward compatibility.
         *
         * It is recommended to import from this file:
         *
         * `import { callOverlayHandler } from '/path/to/overlay_plugin_api';`
         */
        callOverlayHandler: IOverlayHandler;
    }
}

type IAddOverlayListener = <T extends EventType>(event: T, cb: EventMap[T]) => boolean;
type IRemoveOverlayListener = <T extends EventType>(event: T, cb: EventMap[T]) => boolean;

type Subscriber<T> = {
    [key in EventType]?: T[];
};
type EventParameter = Parameters<EventMap[EventType]>[0];
type VoidFunc<T> = (...args: T[]) => void;

export let inited = false;

let wsUrl: RegExpExecArray | null = null;
let ws: WebSocket | null = null;
let queue: (
    | { [s: string]: unknown }
    | [{ [s: string]: unknown }, ((value: string | null) => unknown) | undefined]
    )[] | null = [];
let rseqCounter = 0;
const responsePromises: Record<number, (value: unknown) => void> = {};

export const subscribers: Subscriber<VoidFunc<unknown>> = {};

const sendMessage = (
    msg: { [s: string]: unknown },
    cb?: (value: string | null) => unknown,
): void => {
    if (ws) {
        if (queue)
            queue.push(msg);
        else
            ws.send(JSON.stringify(msg));
    } else {
        if (queue)
            queue.push([msg, cb]);
        else
            window.OverlayPluginApi.callHandler(JSON.stringify(msg), cb);
    }
};

const processEvent = <T extends EventType>(msg: Parameters<EventMap[T]>[0]): void => {
    init();

    const subs = subscribers[msg.type];
    subs?.forEach((sub) => {
        try {
            sub(msg)
        } catch (e) {
            console.error(e);
        }
    });
};

export const dispatchOverlayEvent = processEvent;

export const addOverlayListener: IAddOverlayListener = (event, cb): boolean => {
    init();

    if (!subscribers[event]) {
        subscribers[event] = [];

        if (!queue) {
            sendMessage({
                call: 'subscribe',
                events: [event],
            });
        }
    }
    const list = subscribers[event];
    const pos = list?.indexOf(cb as VoidFunc<unknown>);

    if (pos && pos > -1) return false;
    list?.push(cb as VoidFunc<unknown>);
    return true
};

export const removeOverlayListener: IRemoveOverlayListener = (event, cb): boolean => {
    init();

    if (subscribers[event]) {
        const list = subscribers[event];
        const pos = list?.indexOf(cb as VoidFunc<unknown>);

        if (pos !== undefined && pos > -1) {
            list?.splice(pos, 1);
            return true
        }
    }
    return false
};

const callOverlayHandlerInternal: IOverlayHandler = (
    _msg: { [s: string]: unknown },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
    init();

    const msg = {
        ..._msg,
        rseq: 0,
    };
    let p: Promise<unknown>;

    if (ws) {
        msg.rseq = rseqCounter++;
        p = new Promise((resolve) => {
            responsePromises[msg.rseq] = resolve;
        });

        sendMessage(msg);
    } else {
        p = new Promise((resolve) => {
            sendMessage(msg, (data) => {
                resolve(data === null ? null : JSON.parse(data));
            });
        });
    }

    return p;
};

type OverrideMap = { [call in OverlayHandlerTypes]?: OverlayHandlerFuncs[call] };
const callOverlayHandlerOverrideMap: OverrideMap = {};

export const callOverlayHandler: IOverlayHandler = (
    _msg: { [s: string]: unknown },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
    init();

    // If this `as` is incorrect, then it will not find an override.
    // TODO: we could also replace this with a type guard.
    const type = _msg.call as keyof OverrideMap;
    const callFunc = callOverlayHandlerOverrideMap[type] ?? callOverlayHandlerInternal;

    // The `IOverlayHandler` type guarantees that parameters/return type match
    // one of the overlay handlers.  The OverrideMap also only stores functions
    // that match by the discriminating `call` field, and so any overrides
    // should be correct here.
    // eslint-disable-next-line max-len
    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-argument
    return callFunc(_msg as any);
};

export const setOverlayHandlerOverride = <T extends keyof OverlayHandlerFuncs>(
    type: T,
    override?: OverlayHandlerFuncs[T],
): void => {
    if (!override) {
        delete callOverlayHandlerOverrideMap[type];
        return;
    }
    callOverlayHandlerOverrideMap[type] = override;
};

export const init = (): void => {
    if (inited)
        return;

    if (typeof window !== 'undefined') {
        wsUrl = /[\?&]OVERLAY_WS=([^&]+)/.exec(window.location.href);
        if (wsUrl) {
            const connectWs = function () {
                ws = new WebSocket(decodeURIComponent(wsUrl?.[1] as string));

                ws.addEventListener('error', (e) => {
                    console.error(e);
                });

                ws.addEventListener('open', () => {
                    console.log('Connected!');

                    const q = queue ?? [];
                    queue = null;

                    sendMessage({
                        call: 'subscribe',
                        events: Object.keys(subscribers),
                    });

                    for (const msg of q) {
                        if (!Array.isArray(msg))
                            sendMessage(msg);
                    }
                });

                ws.addEventListener('message', (_msg) => {
                    try {
                        if (typeof _msg.data !== 'string') {
                            console.error('Invalid message data received: ', _msg);
                            return;
                        }
                        const msg = JSON.parse(_msg.data) as EventParameter & { rseq?: number };

                        if (msg.rseq !== undefined && responsePromises[msg.rseq]) {
                            responsePromises[msg.rseq]?.(msg);
                            delete responsePromises[msg.rseq];
                        } else {
                            processEvent(msg);
                        }
                    } catch (e) {
                        console.error('Invalid message received: ', _msg);
                        return;
                    }
                });

                ws.addEventListener('close', () => {
                    queue = null;

                    console.log('Trying to reconnect...');
                    // Don't spam the server with retries.
                    window.setTimeout(() => {
                        connectWs();
                    }, 300);
                });
            };

            connectWs();
        } else {
            const waitForApi = function () {
                if (!window.OverlayPluginApi || !window.OverlayPluginApi.ready) {
                    window.setTimeout(waitForApi, 300);
                    return;
                }

                const q = queue ?? [];
                queue = null;

                window.__OverlayCallback = processEvent;

                sendMessage({
                    call: 'subscribe',
                    events: Object.keys(subscribers),
                });

                for (const item of q) {
                    if (Array.isArray(item))
                        sendMessage(item[0], item[1]);
                }
            };

            waitForApi();
        }

        // Here the OverlayPlugin API is registered to the window object,
        // but this is mainly for backwards compatibility.For cactbot's built-in files,
        // it is recommended to use the various functions exported in resources/overlay_plugin_api.ts.
        window.addOverlayListener = addOverlayListener;
        window.removeOverlayListener = removeOverlayListener;
        window.callOverlayHandler = callOverlayHandler;
        window.dispatchOverlayEvent = dispatchOverlayEvent;
    }

    inited = true;
};