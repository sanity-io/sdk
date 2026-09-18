---
'@sanity/sdk': minor
---

Add `REFUSED` to `MessageBusErrorCode`, `MessageBusMessage.reject()` so a host responder can refuse an event, and `MessageBusClient.reject()` so a host can refuse a state topic for one connection until it next writes a value.
