import assert from 'node:assert/strict';

// Explicit teaching model. No application modules, database, or payment service.
let assertions = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); assertions++; }
const canonical = items => JSON.stringify([...items].sort((a, b) => a.productId.localeCompare(b.productId)));
function store() { return { stock: { a: 5, b: 3 }, orders: [], events: [] }; }
function checkout(db, actor, key, items, { failEvidence = false } = {}) {
  const hash = canonical(items);
  const old = db.orders.find(o => o.actor === actor && o.key === key);
  if (old) return old.hash === hash ? { kind: 'replay', id: old.id } : { kind: 'conflict' };
  if (items.some(x => !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > (db.stock[x.productId] ?? 0))) return { kind: 'unavailable' };
  const before = structuredClone(db);
  const id = 'order-' + (db.orders.length + 1);
  db.orders.push({ id, actor, key, hash });
  for (const item of items) db.stock[item.productId] -= item.quantity;
  if (failEvidence) { Object.assign(db, before); return { kind: 'evidence-failed' }; }
  db.events.push({ id, action: 'CHECKOUT' });
  return { kind: 'accepted', id };
}
const items = [{ productId: 'b', quantity: 1 }, { productId: 'a', quantity: 2 }];
const db = store();
check(checkout(db, 'alice', 'key-1', items), { kind: 'accepted', id: 'order-1' }, 'first acceptance');
const accepted = structuredClone(db);
check(checkout(db, 'alice', 'key-1', [...items].reverse()), { kind: 'replay', id: 'order-1' }, 'reordered logical request replays');
check(db, accepted, 'replay has no second inventory effect');
check(checkout(db, 'alice', 'key-1', [{ productId: 'a', quantity: 1 }]), { kind: 'conflict' }, 'changed meaning rejected');
check(db, accepted, 'conflict leaves durable evidence unchanged');
check(checkout(db, 'bruno', 'key-1', [{ productId: 'a', quantity: 1 }]).kind, 'accepted', 'same text key belongs to another actor namespace');
check(db.orders.length, 2, 'different account is a distinct order');
const lostResponse = store();
checkout(lostResponse, 'alice', 'stable', items);
check(checkout(lostResponse, 'alice', 'stable', items).kind, 'replay', 'same identity resolves response loss');
check(lostResponse.stock.a, 3, 'response loss recovery reserved once');
check(checkout(lostResponse, 'alice', 'new', items).kind, 'accepted', 'new key expresses a second purchase');
check(lostResponse.stock.a, 1, 'new-key counterexample reserves twice');
const rollback = store();
check(checkout(rollback, 'alice', 'failed', items, { failEvidence: true }).kind, 'evidence-failed', 'audit failure schedule');
check(rollback, store(), 'model rollback restores inventory and order');
const last = store();
check(checkout(last, 'alice', 'one', [{ productId: 'b', quantity: 3 }]).kind, 'accepted', 'last units accepted once');
check(checkout(last, 'bruno', 'two', [{ productId: 'b', quantity: 1 }]).kind, 'unavailable', 'sequential competitor rejected');
check(last.stock.b, 0, 'stock does not become negative');
console.log(JSON.stringify({ lab: 'commerce-checkout-schedules', kind: 'in-memory-teaching-model', assertions, passed: true, concurrencyExecuted: false, databaseExecuted: false }));
