// Test double for the parse worker: allocates until the heap limit kills it.
const keep = [];
for (;;) keep.push(new Array(100_000).fill("x"));
