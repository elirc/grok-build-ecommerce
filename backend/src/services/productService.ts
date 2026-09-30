import * as repo from "../repositories/productRepository";
import { Actor, requireAdmin } from "../middleware/auth";
import {
  identity,
  productInput,
  productUpdate,
  productList,
  deleteInput,
} from "../lib/validation";
export const getAllProducts = (actor: Actor, query: unknown) =>
  repo.findAll(actor, productList.parse(query));
export const getProduct = (actor: Actor, id: unknown) =>
  repo.find(actor, identity.parse(id));
export function createProduct(actor: Actor, value: unknown) {
  requireAdmin(actor);
  return repo.create(actor, productInput.parse(value));
}
export function updateProduct(actor: Actor, id: unknown, value: unknown) {
  requireAdmin(actor);
  const data = productUpdate.parse(value);
  return repo.update(actor, identity.parse(id), data.version, data.product);
}
export function deleteProduct(actor: Actor, id: unknown, value: unknown) {
  requireAdmin(actor);
  return repo.remove(
    actor,
    identity.parse(id),
    deleteInput.parse(value).version,
  );
}
export const history = (actor: Actor, id: unknown) =>
  repo.history(actor, identity.parse(id));
