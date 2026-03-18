/**
 * Polyfills for Convex environment
 *
 * This file provides browser-like APIs that may be missing in the Convex runtime.
 */

// polyfill MessageChannel without using node:events
class MockMessagePort {
	onmessage: ((this: MessagePort, ev: MessageEvent) => void) | null = null;
	onmessageerror: ((this: MessagePort, ev: MessageEvent) => void) | null = null;

	close() {}
	postMessage(_message: unknown, _transfer?: Transferable[]) {}
	start() {}
	addEventListener(
		_type: string,
		_listener: EventListenerOrEventListenerObject | null,
		_options?: boolean | AddEventListenerOptions,
	) {}
	removeEventListener(
		_type: string,
		_listener: EventListenerOrEventListenerObject | null,
		_options?: boolean | EventListenerOptions,
	) {}
	dispatchEvent(_event: Event): boolean {
		return true;
	}
}

class MockMessageChannel {
	port1 = new MockMessagePort();
	port2 = new MockMessagePort();
}

if (typeof MessageChannel === "undefined") {
	(globalThis as Record<string, unknown>).MessageChannel = MockMessageChannel;
}
