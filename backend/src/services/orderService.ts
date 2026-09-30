import * as repo from "../repositories/orderRepository";
import { Actor } from "../middleware/auth";
import {
  identity,
  orderList,
  checkoutInput,
  transitionInput,
} from "../lib/validation";
export const getAllOrders = (actor: Actor, query: unknown) =>
  repo.findAll(actor, orderList.parse(query));
export const getOrder = (actor: Actor, id: unknown) =>
  repo.find(actor, identity.parse(id));
export const createOrder = (actor: Actor, value: unknown) =>
  repo.checkout(actor, checkoutInput.parse(value));
export const transitionOrder = (actor: Actor, id: unknown, value: unknown) =>
  repo.transition(actor, identity.parse(id), transitionInput.parse(value));
export const history = (actor: Actor, id: unknown) =>
  repo.history(actor, identity.parse(id));
