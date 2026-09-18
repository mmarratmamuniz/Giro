-- Execute after schema.sql and migrations_level1.sql, with a database backup.
-- Existing rows are assigned to one legacy tenant. Set its name before running.
BEGIN;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (name) VALUES ('Finish Bebidas');

-- This migration starts from a single-company database.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tenants) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one legacy tenant';
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.categories ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.products ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.purchases ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.purchase_items ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.sales ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.sale_items ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.stock_movements ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.cash_shifts ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.cash_transactions ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

UPDATE public.profiles SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.categories SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.products SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.purchases SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.purchase_items SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.sales SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.sale_items SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.stock_movements SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.cash_shifts SET tenant_id = (SELECT id FROM public.tenants);
UPDATE public.cash_transactions SET tenant_id = (SELECT id FROM public.tenants);

-- The signed-in user's database profile is the only source of tenant identity.
CREATE FUNCTION public.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

-- New registrations never inherit a tenant or an admin role from user metadata.
-- Membership must be provisioned by a trusted server using the service role.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.purchase_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sale_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.stock_movements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.cash_shifts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.cash_transactions ALTER COLUMN tenant_id SET NOT NULL;

-- Allow existing client inserts without passing a tenant from the browser.
CREATE FUNCTION public.set_row_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
      RAISE EXCEPTION 'Tenant mismatch';
    END IF;
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'Tenant membership required'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tenant cannot be changed';
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','purchases','purchase_items','sales',
    'sale_items','stock_movements','cash_shifts','cash_transactions'] LOOP
    EXECUTE format('CREATE TRIGGER set_tenant BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_row_tenant()', t);
    EXECUTE format('CREATE UNIQUE INDEX ON public.%I (tenant_id, id)', t);
    EXECUTE format('CREATE INDEX ON public.%I (tenant_id)', t);
  END LOOP;
END $$;
CREATE INDEX ON public.profiles (tenant_id);
CREATE UNIQUE INDEX profiles_tenant_user_key ON public.profiles (tenant_id, id);

-- Database-level checks stop cross-tenant references even from trusted scripts.
ALTER TABLE public.products ADD CONSTRAINT products_category_tenant_fk FOREIGN KEY (tenant_id, category_id) REFERENCES public.categories(tenant_id, id);
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_purchase_tenant_fk FOREIGN KEY (tenant_id, purchase_id) REFERENCES public.purchases(tenant_id, id);
ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_product_tenant_fk FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id);
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_tenant_fk FOREIGN KEY (tenant_id, sale_id) REFERENCES public.sales(tenant_id, id);
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_tenant_fk FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id);
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_product_tenant_fk FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id);
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_transactions_shift_tenant_fk FOREIGN KEY (tenant_id, shift_id) REFERENCES public.cash_shifts(tenant_id, id);
ALTER TABLE public.sales ADD CONSTRAINT sales_shift_tenant_fk FOREIGN KEY (tenant_id, shift_id) REFERENCES public.cash_shifts(tenant_id, id);
ALTER TABLE public.sales ADD CONSTRAINT sales_user_tenant_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id);
ALTER TABLE public.stock_movements ADD CONSTRAINT movements_user_tenant_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id);
ALTER TABLE public.cash_shifts ADD CONSTRAINT shifts_user_tenant_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id);
ALTER TABLE public.cash_transactions ADD CONSTRAINT transactions_user_tenant_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles(tenant_id, id);

ALTER TABLE public.categories DROP CONSTRAINT categories_name_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_name_key UNIQUE (tenant_id, name);
ALTER TABLE public.products DROP CONSTRAINT products_sku_key;
ALTER TABLE public.products ADD CONSTRAINT products_tenant_sku_key UNIQUE (tenant_id, sku);

DROP POLICY IF EXISTS "Acesso completo a categorias" ON public.categories;
DROP POLICY IF EXISTS "Acesso completo a produtos" ON public.products;
DROP POLICY IF EXISTS "Acesso completo a compras" ON public.purchases;
DROP POLICY IF EXISTS "Acesso completo a itens de compras" ON public.purchase_items;
DROP POLICY IF EXISTS "Acesso completo a vendas" ON public.sales;
DROP POLICY IF EXISTS "Acesso completo a itens de vendas" ON public.sale_items;
DROP POLICY IF EXISTS "Acesso completo a movimentacoes" ON public.stock_movements;
DROP POLICY IF EXISTS "Acesso completo a perfis" ON public.profiles;
DROP POLICY IF EXISTS "Acesso completo a turnos de caixa" ON public.cash_shifts;
DROP POLICY IF EXISTS "Acesso completo a transacoes de caixa" ON public.cash_transactions;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON public.tenants FOR SELECT TO authenticated
  USING (id = (SELECT public.current_tenant_id()));
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
-- Profile creation, role changes and tenant assignment are server-only.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','purchases','purchase_items','sales',
    'sale_items','stock_movements','cash_shifts','cash_transactions'] LOOP
    EXECUTE format('CREATE POLICY tenant_access ON public.%I FOR ALL TO authenticated USING (tenant_id = (SELECT public.current_tenant_id())) WITH CHECK (tenant_id = (SELECT public.current_tenant_id()))', t);
  END LOOP;
END $$;

-- Remove broad legacy RPC entry points before adding tenant-aware implementations.
DROP FUNCTION IF EXISTS public.create_complete_sale(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_complete_sale(text, jsonb, uuid, numeric, bigint);
DROP FUNCTION IF EXISTS public.cancel_sale(bigint, text, uuid);

CREATE FUNCTION public.create_complete_sale(
  p_payment_method text, p_items jsonb, p_user_id uuid DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0, p_shift_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tenant uuid := public.current_tenant_id(); item jsonb; product record;
  sale_id bigint; gross numeric(10,2) := 0; net numeric(10,2); qty integer;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Membership required'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Invalid user'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Empty sale'; END IF;
  IF p_discount_amount IS NULL OR p_discount_amount < 0 THEN RAISE EXCEPTION 'Invalid discount'; END IF;
  IF p_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cash_shifts WHERE id = p_shift_id AND tenant_id = tenant AND status = 'OPEN'
  ) THEN RAISE EXCEPTION 'Invalid shift'; END IF;
  -- Lock every product before checking stock. Duplicate product IDs are rejected.
  IF (SELECT count(DISTINCT x->>'product_id') FROM jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate product';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id')::bigint LOOP
    qty := (item->>'quantity')::integer;
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT id, name, sale_price, stock_quantity, is_active INTO product
      FROM public.products WHERE id = (item->>'product_id')::bigint AND tenant_id = tenant FOR UPDATE;
    IF NOT FOUND OR NOT product.is_active OR product.stock_quantity < qty THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    gross := gross + qty * product.sale_price;
  END LOOP;
  IF p_discount_amount > gross THEN RAISE EXCEPTION 'Discount exceeds total'; END IF;
  net := gross - p_discount_amount;
  INSERT INTO public.sales (tenant_id, total_amount, payment_method, user_id, status, discount_amount, shift_id)
    VALUES (tenant, net, p_payment_method, auth.uid(), 'COMPLETED', p_discount_amount, p_shift_id)
    RETURNING id INTO sale_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    qty := (item->>'quantity')::integer;
    SELECT id, sale_price INTO product FROM public.products
      WHERE id = (item->>'product_id')::bigint AND tenant_id = tenant;
    INSERT INTO public.sale_items (tenant_id, sale_id, product_id, quantity, unit_price)
      VALUES (tenant, sale_id, product.id, qty, product.sale_price);
    UPDATE public.products SET stock_quantity = stock_quantity - qty, updated_at = now()
      WHERE id = product.id AND tenant_id = tenant;
    INSERT INTO public.stock_movements (tenant_id, product_id, movement_type, quantity, origin, note, user_id)
      VALUES (tenant, product.id, 'OUT', qty, 'SALE', 'Venda #' || sale_id, auth.uid());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'sale_id', sale_id, 'gross_amount', gross,
    'discount_amount', p_discount_amount, 'total_amount', net);
END $$;

CREATE FUNCTION public.cancel_sale(p_sale_id bigint, p_reason text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tenant uuid := public.current_tenant_id(); sale record; item record;
BEGIN
  IF tenant IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Membership required'; END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Invalid user'; END IF;
  SELECT * INTO sale FROM public.sales WHERE id = p_sale_id AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND OR sale.status = 'CANCELED' THEN RAISE EXCEPTION 'Sale unavailable'; END IF;
  UPDATE public.sales SET status = 'CANCELED', cancel_reason = p_reason, canceled_at = now()
    WHERE id = p_sale_id AND tenant_id = tenant;
  FOR item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id AND tenant_id = tenant LOOP
    UPDATE public.products SET stock_quantity = stock_quantity + item.quantity, updated_at = now()
      WHERE id = item.product_id AND tenant_id = tenant;
    INSERT INTO public.stock_movements (tenant_id, product_id, movement_type, quantity, origin, note, user_id)
      VALUES (tenant, item.product_id, 'IN', item.quantity, 'SALE_CANCEL',
        'Estorno da Venda #' || p_sale_id || ' - Motivo: ' || coalesce(p_reason, 'Cancelamento'), auth.uid());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'status', 'CANCELED');
END $$;

REVOKE ALL ON FUNCTION public.create_complete_sale(text,jsonb,uuid,numeric,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_sale(bigint,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_complete_sale(text,jsonb,uuid,numeric,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale(bigint,text,uuid) TO authenticated;
-- Legacy admin deletion RPC has no caller or tenant check. Disable until replaced.
DROP FUNCTION IF EXISTS public.delete_user_by_admin(uuid);
COMMIT;
