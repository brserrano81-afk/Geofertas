# Company Context: Geofertas

Geofertas / Economiza Facil is a WhatsApp-first grocery price comparison product for Brazilian users. The official operational flow is:

Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox.

Primary value proposition: help users compare supermarket prices, manage shopping lists, find offers, and save money through a conversational WhatsApp assistant plus supporting web/admin surfaces.

Current quality priorities:

- Preserve the WhatsApp-first official flow.
- Avoid broad rewrites of the core conversation logic.
- Stabilize build, tests, Firebase data access, Evolution delivery, and deploy gates.
- Treat whatsapp-web.js bridge as legacy/lab unless explicitly reactivated.
