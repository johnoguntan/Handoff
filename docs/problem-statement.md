# Problem statement: facts vs hypotheses

## Documented (public, not verified by this project)

- Food-delivery platforms such as Deliveroo and Delivery Hero have publicly described riders waiting at
  restaurants for food that is not ready.
- Chowdeck's app already shows "Order Ready" (set by the vendor) and "Rider At The Restaurant" (with
  arrival time). Handoff does not present those as new.

## Hypotheses (NOT confirmed at Chowdeck)

- H1: Riders at Chowdeck often wait at restaurants because food is not ready on arrival.
- H2: Vendors tend to start preparing when the rider arrives, and riders are dispatched immediately
  after order acceptance.
- H3: Using each vendor's past prep-time reliability to decide _when to tell the rider to leave_ would
  reduce rider waiting without raising food waiting or delay materially.

H3 is the only candidate novelty. All simulation results test H3 on **synthetic** data and say nothing
about real-world performance.
