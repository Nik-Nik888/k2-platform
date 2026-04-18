-- ══════════════════════════════════════════════════════════
-- Миграция 004: рассрочки от фирмы
-- ══════════════════════════════════════════════════════════

BEGIN;

-- ── Сами рассрочки ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  contract_number TEXT,             -- № договора (например "2026-042")
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  initial_payment NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (initial_payment >= 0),
  months INTEGER NOT NULL CHECK (months BETWEEN 1 AND 60),
  interest_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0), -- % годовых
  start_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue', 'cancelled')),
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installments_org ON installments(org_id);
CREATE INDEX IF NOT EXISTS idx_installments_client ON installments(client_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- ── График платежей ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Порядковый номер платежа в графике (1, 2, 3 ...)
  seq INTEGER NOT NULL,

  -- Плановые значения
  due_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),

  -- Факт
  paid_date DATE,
  paid_amount NUMERIC(12, 2),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (installment_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_inst_payments_installment ON installment_payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_inst_payments_due_date ON installment_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_inst_payments_status ON installment_payments(status);
CREATE INDEX IF NOT EXISTS idx_inst_payments_org ON installment_payments(org_id);

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;

-- installments: per-org изоляция
CREATE POLICY installments_select ON installments FOR SELECT
  USING (org_id = get_user_org_id());
CREATE POLICY installments_insert ON installments FOR INSERT
  WITH CHECK (org_id = get_user_org_id());
CREATE POLICY installments_update ON installments FOR UPDATE
  USING (org_id = get_user_org_id());
CREATE POLICY installments_delete ON installments FOR DELETE
  USING (org_id = get_user_org_id());

-- installment_payments: per-org изоляция (через собственный org_id)
CREATE POLICY inst_payments_select ON installment_payments FOR SELECT
  USING (org_id = get_user_org_id());
CREATE POLICY inst_payments_insert ON installment_payments FOR INSERT
  WITH CHECK (org_id = get_user_org_id());
CREATE POLICY inst_payments_update ON installment_payments FOR UPDATE
  USING (org_id = get_user_org_id());
CREATE POLICY inst_payments_delete ON installment_payments FOR DELETE
  USING (org_id = get_user_org_id());

-- ── Триггер auto-update updated_at ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_installments_updated ON installments;
CREATE TRIGGER trg_installments_updated
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_inst_payments_updated ON installment_payments;
CREATE TRIGGER trg_inst_payments_updated
  BEFORE UPDATE ON installment_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
