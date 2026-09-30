import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Audit,
  Page,
  Product,
  ProductDraft,
  Session,
  cents,
  moneyFromCents,
  productDraft,
  request,
  exportDraft,
} from "../../../api/client";
import { Guard, useDebounced, useWorkspace } from "../../../hooks/useWorkspace";
import { Feedback, Pagination, QueryError } from "../../../components/Feedback";
const blank = (): ProductDraft => ({
  sku: "",
  name: "",
  description: "",
  category: "",
  price: "",
  stock: "0",
  active: true,
});
export function ProductsPage({
  session,
  onAdd,
  externalBusy,
  cartLocked,
  cartFull,
  onGuardChange,
}: {
  session: Session;
  onAdd: (product: Product) => void;
  externalBusy: boolean;
  cartLocked: boolean;
  cartFull: boolean;
  onGuardChange: (guard: Guard) => void;
}) {
  const admin = session.user.role === "ADMIN",
    cache = useQueryClient(),
    prefix = [session.user.id, "products"];
  const [search, setSearch] = useState(""),
    query = useDebounced(search),
    [page, setPage] = useState(1),
    [active, setActive] = useState("true");
  const [selected, setSelected] = useState<Product | "new" | null>(null),
    [draft, setDraft] = useState<ProductDraft>(blank),
    [dirty, setDirty] = useState(false),
    work = useWorkspace(dirty, onGuardChange),
    locked = work.busy || externalBusy;
  const products = useQuery({
    queryKey: [...prefix, query, page, active],
    queryFn: ({ signal }) =>
      request<Page<Product>>(
        "/products?" +
          new URLSearchParams({ q: query, page: String(page), active }),
        session.token,
        { signal },
      ),
  });
  const selectedId = selected && selected !== "new" ? selected.id : "";
  const audit = useQuery({
    queryKey: [session.user.id, "product-audit", selectedId],
    enabled: admin && !!selectedId,
    queryFn: ({ signal }) =>
      request<{ items: Audit[] }>(
        "/products/" + selectedId + "/audit",
        session.token,
        { signal },
      ),
  });
  useEffect(() => setPage(1), [query, active]);
  useEffect(() => {
    if (
      products.data &&
      page > Math.max(1, Math.ceil(products.data.total / 20))
    )
      setPage(Math.max(1, Math.ceil(products.data.total / 20)));
  }, [products.data, page]);
  function adopt(row: Product) {
    setSelected(row);
    setDraft(productDraft(row));
    setDirty(false);
  }
  function clear() {
    setSelected(null);
    setDraft(blank());
    setDirty(false);
    work.setError("");
    work.setNotice("");
  }
  function change<K extends keyof ProductDraft>(
    key: K,
    value: ProductDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || !admin || externalBusy) return;
    const baseline = selected,
      input = { ...draft, stock: Number(draft.stock) };
    void work.run(async () => {
      if (!/^(0|[1-9]\d{0,6})$/.test(draft.stock) || input.stock > 1000000)
        throw new Error("Use a whole stock quantity from 0 through 1000000.");
      const row = await request<Product>(
        "/products" + (baseline === "new" ? "" : "/" + baseline.id),
        session.token,
        {
          method: baseline === "new" ? "POST" : "PUT",
          body: JSON.stringify(
            baseline === "new"
              ? input
              : { version: baseline.version, product: input },
          ),
        },
      );
      if (work.alive.current) {
        adopt(row);
        work.setNotice("Product saved at version " + row.version + ".");
        await cache.invalidateQueries({ queryKey: [session.user.id] });
      }
    });
  }
  return (
    <section aria-label="Product catalogue">
      <div className="section-title">
        <div>
          <p className="eyebrow">THE COLLECTION</p>
          <h2>Product catalogue</h2>
        </div>
        {admin && (
          <button
            className="primary"
            disabled={locked}
            onClick={() => {
              if (work.mayDiscard()) {
                clear();
                setSelected("new");
                setDirty(true);
              }
            }}
          >
            New product
          </button>
        )}
      </div>
      <Feedback error={work.error} notice={work.notice} />
      <div className="catalogue-filters">
        <label>
          Search products
          <input
            type="search"
            maxLength={120}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, SKU, or category"
          />
        </label>
        {admin && (
          <label>
            Product visibility
            <select
              aria-label="Product visibility"
              value={active}
              onChange={(event) => setActive(event.target.value)}
            >
              <option value="true">Active products</option>
              <option value="false">Archived products</option>
              <option value="">All products</option>
            </select>
          </label>
        )}
        <button
          disabled={products.isFetching}
          onClick={() => void products.refetch()}
        >
          Refresh products
        </button>
      </div>
      {products.isPending && <p role="status">Loading catalogue...</p>}
      <QueryError error={products.error} hasData={!!products.data} />
      {products.data && (
        <>
          <p className="muted">
            {products.data.total}{" "}
            {products.data.total === 1 ? "product" : "products"} match this view
          </p>
          <div className="product-cards">
            {products.data.items.map((row) => (
              <article className="panel product-card" key={row.id}>
                <div className="product-art" aria-hidden="true">
                  {row.category === "Stationery" ? "Aa" : "+"}
                </div>
                <span className="badge">
                  {row.category || "Uncategorized"}
                  {!row.active && " / archived"}
                </span>
                <h3>{row.name}</h3>
                <p>{row.description || "No description yet."}</p>
                <p className="price">{moneyFromCents(cents(row.price))}</p>
                <p className="muted">
                  {row.stock} available / {row.sku}
                </p>
                <div className="actions">
                  <button
                    disabled={
                      cartLocked || cartFull || !row.active || row.stock === 0
                    }
                    onClick={() => onAdd(row)}
                  >
                    Add {row.name} to cart
                  </button>
                  {admin && (
                    <button
                      disabled={locked}
                      onClick={() => {
                        if (work.mayDiscard())
                          void work.run(async () => {
                            const current = await request<Product>(
                              "/products/" + row.id,
                              session.token,
                            );
                            if (work.alive.current) adopt(current);
                          });
                      }}
                    >
                      Edit {row.name}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!products.data.items.length && <p>No products match this search.</p>}
          <Pagination
            page={page}
            total={products.data.total}
            busy={products.isFetching}
            label="products"
            onChange={setPage}
          />
        </>
      )}
      {cartFull && (
        <p className="message">
          A cart supports up to 50 different products. Edit its existing
          quantities or remove a line before adding another product.
        </p>
      )}
      {admin && selected && (
        <section className="panel product-editor" aria-label="Product editor">
          <div className="section-title">
            <h3>{selected === "new" ? "New product" : selected.name}</h3>
            <span className="badge">
              {selected === "new" ? "DRAFT" : "Version " + selected.version}
            </span>
          </div>
          <p>
            {dirty ? "Unsaved product changes" : "Showing saved product values"}
          </p>
          <form onSubmit={save}>
            <fieldset disabled={locked}>
              <label>
                SKU
                <input
                  required
                  maxLength={40}
                  value={draft.sku}
                  onChange={(e) => change("sku", e.target.value)}
                />
              </label>
              <label>
                Product name
                <input
                  required
                  maxLength={160}
                  value={draft.name}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Description"
                  rows={4}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => change("description", e.target.value)}
                />
              </label>
              <label>
                Category
                <input
                  maxLength={80}
                  value={draft.category}
                  onChange={(e) => change("category", e.target.value)}
                />
              </label>
              <div className="field-pair">
                <label>
                  Price in USD
                  <input
                    required
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    value={draft.price}
                    onChange={(e) => change("price", e.target.value)}
                  />
                </label>
                <label>
                  Available stock
                  <input
                    required
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={draft.stock}
                    onChange={(e) => change("stock", e.target.value)}
                  />
                </label>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => change("active", e.target.checked)}
                />
                Active in the catalogue
              </label>
            </fieldset>
            <div className="actions">
              <button className="primary" disabled={locked}>
                Save product
              </button>
              <button
                type="button"
                onClick={() =>
                  exportDraft("product-draft.json", {
                    id: selected === "new" ? null : selected.id,
                    version: selected === "new" ? null : selected.version,
                    product: draft,
                  })
                }
              >
                Export product draft
              </button>
              {selected !== "new" && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (
                      confirm(
                        "Replace the product editor with saved values? Export its draft first.",
                      )
                    )
                      void work.run(async () => {
                        const row = await request<Product>(
                          "/products/" + selected.id,
                          session.token,
                        );
                        if (work.alive.current) adopt(row);
                      });
                  }}
                >
                  Load current product
                </button>
              )}
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (work.mayDiscard()) clear();
                }}
              >
                Close product
              </button>
            </div>
          </form>
          {selected !== "new" && (
            <>
              <p className="muted">
                Purchased products retain order history. Uncheck Active and save
                to archive them.
              </p>
              <button
                className="danger"
                disabled={locked}
                onClick={() => {
                  if (
                    confirm(
                      "Delete this product permanently and discard its pending draft? Products referenced by orders must be archived instead.",
                    )
                  )
                    void work.run(async () => {
                      await request("/products/" + selected.id, session.token, {
                        method: "DELETE",
                        body: JSON.stringify({ version: selected.version }),
                      });
                      if (work.alive.current) {
                        clear();
                        work.setNotice("Product deleted.");
                        await cache.invalidateQueries({
                          queryKey: [session.user.id],
                        });
                      }
                    });
                }}
              >
                Delete product
              </button>
              <h4>Recent product changes</h4>
              <QueryError error={audit.error} />
              {audit.data && (
                <ol>
                  {audit.data.items.map((row) => (
                    <li key={row.id}>
                      {row.action.toLowerCase()} - version {row.version}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
