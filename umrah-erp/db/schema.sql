-- =====================================================================
--  Smart Umrah ERP — PostgreSQL 16 reference schema
--  Bed-Bank · Tri-currency cost ledger · Sales governance · Dual bed maps
--  · 49/50-seat bus · Passport vault · Trip P&L
--
--  Design rule: every business invariant the UI enforces is ALSO enforced
--  here (constraints / triggers), so no client, API bug or race condition
--  can mix genders in a shared room, exceed a credit ceiling, over-absorb
--  an allotment, or keep an expired soft-hold alive.
--
--  Apply:   psql -v ON_ERROR_STOP=1 -f db/schema.sql
--  Verify:  psql -v ON_ERROR_STOP=1 -f db/tests.sql
-- =====================================================================
BEGIN;
DROP SCHEMA IF EXISTS umrah CASCADE;
CREATE SCHEMA umrah;
SET search_path = umrah, public;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE currency_code     AS ENUM ('SAR', 'EGP', 'USD', 'KWD', 'AED');
CREATE TYPE city_code         AS ENUM ('MAK', 'MAD');
CREATE TYPE room_type         AS ENUM ('DBL', 'TPL', 'QUAD', 'QUINT');
CREATE TYPE gender            AS ENUM ('M', 'F');
CREATE TYPE room_gender_lock  AS ENUM ('M', 'F', 'PRIVATE');          -- NULL = pool room, not opened yet
CREATE TYPE pax_type          AS ENUM ('ADULT', 'CHD', 'INF');         -- CHD = child no-bed
CREATE TYPE sale_mode         AS ENUM ('FULL_PACKAGE', 'PRIVATE_ROOM', 'ROOM_ONLY', 'UNBUNDLED');
CREATE TYPE sales_channel     AS ENUM ('DIRECT', 'B2B', 'BROKER');
CREATE TYPE agent_tier        AS ENUM ('B2B', 'BROKER');
CREATE TYPE booking_status    AS ENUM ('SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING', 'DEPOSIT', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE staff_role        AS ENUM ('SALES', 'HEAD', 'MANAGER', 'OPERATIONS', 'FINANCE', 'ADMIN');
CREATE TYPE supplier_category AS ENUM ('HOTEL', 'AIR', 'VISA', 'TRANSPORT', 'OPEX');
CREATE TYPE cost_behavior     AS ENUM ('VAR', 'FIXED');
CREATE TYPE incentive_mode    AS ENUM ('CLIENT_DISCOUNT', 'AGENT_CREDIT');
CREATE TYPE passport_stage    AS ENUM ('REP', 'SAFE', 'CONSULATE', 'SUPERVISOR', 'HANDED');
CREATE TYPE wallet_txn_type   AS ENUM ('TOPUP', 'BOOKING_DEBIT', 'REFUND', 'INCENTIVE_CREDIT', 'COMMISSION_CREDIT', 'COMMISSION_PAYOUT', 'ADJUSTMENT');
CREATE TYPE trip_status       AS ENUM ('DRAFT', 'OPEN_FOR_SALE', 'SOLD_OUT', 'DEPARTED', 'CLOSED');
CREATE TYPE bus_seat_kind     AS ENUM ('PAX', 'DRIVER', 'GUIDE');

-- ---------------------------------------------------------------------
-- 2. HELPERS
-- ---------------------------------------------------------------------
CREATE FUNCTION room_capacity(t room_type) RETURNS int LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT CASE t WHEN 'DBL' THEN 2 WHEN 'TPL' THEN 3 WHEN 'QUAD' THEN 4 WHEN 'QUINT' THEN 5 END $$;

CREATE FUNCTION is_hold_status(s booking_status) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT s IN ('SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING') $$;

CREATE FUNCTION is_live_status(s booking_status) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT s NOT IN ('EXPIRED', 'CANCELLED') $$;

-- ---------------------------------------------------------------------
-- 3. PEOPLE & GOVERNANCE
-- ---------------------------------------------------------------------
CREATE TABLE discount_authority (
  role              staff_role PRIMARY KEY,
  max_discount_pct  numeric(5,2) NOT NULL CHECK (max_discount_pct BETWEEN 0 AND 100)
);
INSERT INTO discount_authority VALUES ('SALES', 0), ('HEAD', 3), ('MANAGER', 7), ('OPERATIONS', 0), ('FINANCE', 0), ('ADMIN', 7);

CREATE TABLE staff (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name  text NOT NULL,
  role       staff_role NOT NULL REFERENCES discount_authority(role),
  phone      text,
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE supervisors (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name text NOT NULL,
  phone_eg  text NOT NULL CHECK (phone_eg ~ '^01[0125][0-9]{8}$'),
  phone_sa  text CHECK (phone_sa ~ '^05[0-9]{8}$')
);

-- ---------------------------------------------------------------------
-- 4. SUPPLIERS, HOTELS & ALLOTMENTS (Bed-Bank)
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      text NOT NULL,
  category  supplier_category NOT NULL,
  currency  currency_code NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE hotels (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city        city_code NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NOT NULL,
  supplier_id bigint NOT NULL REFERENCES suppliers(id)
);

CREATE TABLE hotel_allotments (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         text NOT NULL UNIQUE,
  hotel_id     bigint NOT NULL REFERENCES hotels(id),
  supplier_id  bigint NOT NULL REFERENCES suppliers(id),
  stay_from    date NOT NULL,
  stay_to      date NOT NULL,                       -- exclusive (check-out)
  cutoff_date  date NOT NULL,                       -- release-back date to the hotel
  currency     currency_code NOT NULL DEFAULT 'SAR',
  CHECK (stay_to > stay_from),
  CHECK (cutoff_date <= stay_from)
);

-- Contract per room type (rooms & SAR rate per room-night)
CREATE TABLE allotment_rates (
  allotment_id     bigint NOT NULL REFERENCES hotel_allotments(id) ON DELETE CASCADE,
  room_type        room_type NOT NULL,
  contracted_rooms int NOT NULL CHECK (contracted_rooms >= 0),
  rate_per_night   numeric(12,2) NOT NULL CHECK (rate_per_night >= 0),
  PRIMARY KEY (allotment_id, room_type)
);

-- Daily inventory = the Heatmap source. `free_sale` can never go negative.
CREATE TABLE allotment_inventory_daily (
  allotment_id      bigint NOT NULL,
  stay_date         date NOT NULL,
  room_type         room_type NOT NULL,
  total_rooms       int NOT NULL CHECK (total_rooms >= 0),
  consumed_company  int NOT NULL DEFAULT 0 CHECK (consumed_company >= 0),
  sold_agents       int NOT NULL DEFAULT 0 CHECK (sold_agents >= 0),
  held              int NOT NULL DEFAULT 0 CHECK (held >= 0),
  price_multiplier  numeric(5,3) NOT NULL DEFAULT 1 CHECK (price_multiplier > 0),
  free_sale         int GENERATED ALWAYS AS (total_rooms - consumed_company - sold_agents - held) STORED,
  PRIMARY KEY (allotment_id, stay_date, room_type),
  FOREIGN KEY (allotment_id, room_type) REFERENCES allotment_rates(allotment_id, room_type) ON DELETE CASCADE,
  CONSTRAINT inventory_not_oversold CHECK (total_rooms - consumed_company - sold_agents - held >= 0)
);

-- Seeds the daily grid when a rate line is created.
CREATE FUNCTION fn_seed_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a hotel_allotments;
BEGIN
  SELECT * INTO a FROM hotel_allotments WHERE id = NEW.allotment_id;
  INSERT INTO allotment_inventory_daily (allotment_id, stay_date, room_type, total_rooms)
  SELECT NEW.allotment_id, d::date, NEW.room_type, NEW.contracted_rooms
  FROM generate_series(a.stay_from, a.stay_to - 1, interval '1 day') d
  ON CONFLICT (allotment_id, stay_date, room_type) DO UPDATE SET total_rooms = EXCLUDED.total_rooms;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_seed_inventory AFTER INSERT OR UPDATE OF contracted_rooms ON allotment_rates
  FOR EACH ROW EXECUTE FUNCTION fn_seed_inventory();

-- ---------------------------------------------------------------------
-- 5. TRIPS, COST CENTRE & COSTING
-- ---------------------------------------------------------------------
CREATE TABLE cost_centers (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text NOT NULL UNIQUE CHECK (code ~ '^CC-TRIP-[0-9]{4}-[0-9]{3}$'),
  opened_at  timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz
);

CREATE TABLE trips (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code               text NOT NULL UNIQUE CHECK (code ~ '^TRP-[0-9]{4}-[0-9]{3}$'),
  cost_center_id     bigint NOT NULL UNIQUE REFERENCES cost_centers(id),   -- auto-filled by trg_trip_cost_center
  name               text NOT NULL,
  depart_date        date NOT NULL,
  return_date        date NOT NULL,
  fx_ref_rate        numeric(10,4) NOT NULL CHECK (fx_ref_rate > 0),   -- EGP per 1 SAR, frozen at build time
  planned_pax        int NOT NULL CHECK (planned_pax > 0),
  margin_pct         numeric(5,2) NOT NULL CHECK (margin_pct >= 0),
  breakage_pct       numeric(5,2) NOT NULL DEFAULT 2.5 CHECK (breakage_pct >= 0),
  child_fixed_factor numeric(4,2) NOT NULL DEFAULT 0.5 CHECK (child_fixed_factor BETWEEN 0 AND 1),
  status             trip_status NOT NULL DEFAULT 'DRAFT',
  prices_locked_at   timestamptz,
  prices_locked_by   bigint REFERENCES staff(id),
  CHECK (return_date > depart_date)
);

-- Auto-open the isolated cost centre CC-TRIP-YYYY-NNN from the trip code.
CREATE FUNCTION fn_trip_cost_center() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cost_center_id IS NULL THEN
    INSERT INTO cost_centers (code) VALUES ('CC-' || replace(NEW.code, 'TRP-', 'TRIP-')) RETURNING id INTO NEW.cost_center_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trip_cost_center BEFORE INSERT ON trips FOR EACH ROW EXECUTE FUNCTION fn_trip_cost_center();

CREATE TABLE trip_stays (
  trip_id      bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city         city_code NOT NULL,
  allotment_id bigint NOT NULL REFERENCES hotel_allotments(id),
  check_in     date NOT NULL,
  nights       int NOT NULL CHECK (nights > 0),
  PRIMARY KEY (trip_id, city)
);

CREATE TABLE trip_supervisors (
  trip_id       bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  supervisor_id bigint NOT NULL REFERENCES supervisors(id),
  is_lead       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (trip_id, supervisor_id)
);

CREATE TABLE trip_cost_items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id       bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category      supplier_category NOT NULL,
  name          text NOT NULL,
  supplier_id   bigint REFERENCES suppliers(id),
  currency      currency_code NOT NULL,
  behavior      cost_behavior NOT NULL,             -- VAR = per pax, FIXED = spread over planned pax
  qty           numeric(10,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price    numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  child_factor  numeric(4,2) NOT NULL DEFAULT 1 CHECK (child_factor BETWEEN 0 AND 1),
  infant_factor numeric(4,2) NOT NULL DEFAULT 0 CHECK (infant_factor BETWEEN 0 AND 1),
  CHECK (behavior = 'FIXED' OR qty = 1),
  CHECK (currency IN ('SAR', 'EGP'))
);

-- Official (locked) price list. Products: DBL/TPL/QUAD/QUINT, RO_* (room-only), CHD, INF.
CREATE TABLE trip_price_list (
  trip_id    bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  product    text NOT NULL CHECK (product IN ('DBL','TPL','QUAD','QUINT','RO_DBL','RO_TPL','RO_QUAD','RO_QUINT','CHD','INF')),
  price_egp  numeric(14,2) NOT NULL CHECK (price_egp > 0),
  PRIMARY KEY (trip_id, product)
);
CREATE FUNCTION fn_price_list_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked timestamptz;
BEGIN
  SELECT prices_locked_at INTO locked FROM trips WHERE id = COALESCE(NEW.trip_id, OLD.trip_id);
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'PRICE_LOCKED: official price list of trip % is locked since %', COALESCE(NEW.trip_id, OLD.trip_id), locked
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_price_list_immutable BEFORE INSERT OR UPDATE OR DELETE ON trip_price_list
  FOR EACH ROW EXECUTE FUNCTION fn_price_list_immutable();

-- Cost engine as a view: accommodation (variable, SAR) + breakage + variable + fixed share.
CREATE VIEW v_trip_cost_per_type AS
WITH acc AS (
  SELECT s.trip_id, r.room_type, SUM(r.rate_per_night * s.nights) / room_capacity(r.room_type) AS accom_sar
  FROM trip_stays s JOIN allotment_rates r ON r.allotment_id = s.allotment_id
  GROUP BY s.trip_id, r.room_type
), items AS (
  SELECT i.trip_id,
         SUM(CASE WHEN i.behavior = 'VAR' THEN i.unit_price * CASE i.currency WHEN 'SAR' THEN t.fx_ref_rate ELSE 1 END END) AS var_egp,
         SUM(CASE WHEN i.behavior = 'FIXED' THEN i.qty * i.unit_price * CASE i.currency WHEN 'SAR' THEN t.fx_ref_rate ELSE 1 END END) AS fixed_egp
  FROM trip_cost_items i JOIN trips t ON t.id = i.trip_id GROUP BY i.trip_id
)
SELECT t.id AS trip_id, a.room_type,
       round(a.accom_sar, 2)                                                   AS accom_sar,
       round(a.accom_sar * t.breakage_pct / 100, 2)                            AS breakage_sar,
       round(COALESCE(it.var_egp, 0), 2)                                       AS variable_egp,
       round(COALESCE(it.fixed_egp, 0) / t.planned_pax, 2)                     AS fixed_share_egp,
       round(a.accom_sar * (1 + t.breakage_pct / 100) * t.fx_ref_rate
             + COALESCE(it.var_egp, 0) + COALESCE(it.fixed_egp, 0) / t.planned_pax, 2) AS net_cost_egp,
       ceil((a.accom_sar * (1 + t.breakage_pct / 100) * t.fx_ref_rate
             + COALESCE(it.var_egp, 0) + COALESCE(it.fixed_egp, 0) / t.planned_pax) * (1 + t.margin_pct / 100) / 250) * 250 AS suggested_sell_egp
FROM trips t JOIN acc a ON a.trip_id = t.id LEFT JOIN items it ON it.trip_id = t.id;

-- ---------------------------------------------------------------------
-- 6. B2B AGENTS & WALLETS
-- ---------------------------------------------------------------------
CREATE TABLE b2b_agents (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  tier             agent_tier NOT NULL,
  net_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (net_discount_pct BETWEEN 0 AND 50),
  commission_pct   numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 50),
  pin_hash         text NOT NULL,                  -- bcrypt/argon2 hash, never plaintext
  phone            text,
  is_blocked       boolean NOT NULL DEFAULT false,
  overdue_since    date,                           -- set by AR ageing job; any value locks self-booking
  CHECK (tier = 'B2B' OR net_discount_pct = 0),
  CHECK (tier = 'BROKER' OR commission_pct = 0)
);

CREATE TABLE agent_wallets (
  agent_id     bigint PRIMARY KEY REFERENCES b2b_agents(id) ON DELETE CASCADE,
  currency     currency_code NOT NULL,
  balance      numeric(14,2) NOT NULL DEFAULT 0,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  CONSTRAINT wallet_credit_ceiling CHECK (balance >= -credit_limit)   -- hard stop at DB level
);

CREATE TABLE wallet_transactions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id    bigint NOT NULL REFERENCES agent_wallets(agent_id),
  txn_type    wallet_txn_type NOT NULL,
  amount      numeric(14,2) NOT NULL CHECK (amount <> 0),       -- signed, in wallet currency
  fx_rate     numeric(10,4),                                    -- when converted from EGP booking value
  booking_id  bigint,
  memo        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  bigint REFERENCES staff(id),
  CHECK ((txn_type IN ('BOOKING_DEBIT', 'COMMISSION_PAYOUT') AND amount < 0) OR (txn_type NOT IN ('BOOKING_DEBIT', 'COMMISSION_PAYOUT')))
);

-- Ledger drives the balance; the wallet CHECK rejects anything beyond the credit ceiling.
CREATE FUNCTION fn_wallet_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ag b2b_agents;
BEGIN
  SELECT * INTO ag FROM b2b_agents WHERE id = NEW.agent_id;
  IF NEW.txn_type = 'BOOKING_DEBIT' AND (ag.is_blocked OR ag.overdue_since IS NOT NULL) THEN
    RAISE EXCEPTION 'CREDIT_LOCK: agent % is blocked or overdue since %', ag.code, ag.overdue_since USING ERRCODE = 'check_violation';
  END IF;
  UPDATE agent_wallets SET balance = balance + NEW.amount WHERE agent_id = NEW.agent_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_wallet_post AFTER INSERT ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION fn_wallet_post();

-- ---------------------------------------------------------------------
-- 7. BOOKINGS, PAYMENTS, PASSENGERS
-- ---------------------------------------------------------------------
CREATE TABLE bookings (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                 text NOT NULL UNIQUE,
  trip_id              bigint NOT NULL REFERENCES trips(id),
  channel              sales_channel NOT NULL,
  sale_mode            sale_mode NOT NULL,
  room_type            room_type,                          -- NULL only for pure-service unbundled sales
  services             text[] NOT NULL DEFAULT '{}',       -- UNBUNDLED: {HOTEL,AIR,VISA,BUS}
  staff_id             bigint REFERENCES staff(id),
  agent_id             bigint REFERENCES b2b_agents(id),
  status               booking_status NOT NULL DEFAULT 'SOFT_HOLD',
  gross_egp            numeric(14,2),
  channel_discount_egp numeric(14,2) NOT NULL DEFAULT 0 CHECK (channel_discount_egp >= 0),
  discount_pct         numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  discount_egp         numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_egp >= 0),
  incentive_egp        numeric(14,2) NOT NULL DEFAULT 0 CHECK (incentive_egp >= 0),
  incentive_mode       incentive_mode,
  agent_commission_egp numeric(14,2) NOT NULL DEFAULT 0 CHECK (agent_commission_egp >= 0),
  net_egp              numeric(14,2) CHECK (net_egp >= 0),
  paid_egp             numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_egp >= 0),
  hold_expires_at      timestamptz,
  approved_by          bigint REFERENCES staff(id),
  priced_by            bigint REFERENCES staff(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           bigint REFERENCES staff(id),
  CONSTRAINT bk_channel_actor CHECK ((channel = 'DIRECT' AND staff_id IS NOT NULL AND agent_id IS NULL) OR (channel <> 'DIRECT' AND agent_id IS NOT NULL)),
  CONSTRAINT bk_hold_has_ttl  CHECK (NOT is_hold_status(status) OR hold_expires_at IS NOT NULL),
  CONSTRAINT bk_ttl_window    CHECK (hold_expires_at IS NULL OR hold_expires_at <= created_at + interval '24 hours'),
  CONSTRAINT bk_price_known   CHECK (net_egp IS NOT NULL OR status IN ('PENDING_PRICING', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT bk_room_type     CHECK (room_type IS NOT NULL OR sale_mode = 'UNBUNDLED'),
  CONSTRAINT bk_confirmed_paid CHECK (status <> 'CONFIRMED' OR paid_egp >= net_egp),
  CONSTRAINT bk_deposit_paid   CHECK (status <> 'DEPOSIT' OR (paid_egp > 0 AND paid_egp < net_egp)),
  CONSTRAINT bk_incentive_mode CHECK (incentive_egp = 0 OR (incentive_mode IS NOT NULL AND channel <> 'DIRECT'))
);
CREATE INDEX bookings_holds_idx ON bookings (hold_expires_at) WHERE status IN ('SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING');
CREATE INDEX bookings_trip_idx ON bookings (trip_id, status);

/*
 * Sales governance — derives the only legal status for a booking row:
 *   1. Discount above the creator's authority  → PENDING_APPROVAL until an approver with enough authority signs.
 *   2. Unbundled sale without management price → PENDING_PRICING (price column locked = NULL).
 *   3. Otherwise money decides: paid ≥ net → CONFIRMED · 0 < paid < net → DEPOSIT · else SOFT_HOLD (TTL kept).
 *   4. B2B/Broker channel requires an active agent; B2B bookings are blocked while the agent is credit-locked.
 * EXPIRED/CANCELLED are terminal and never re-derived.
 */
CREATE FUNCTION fn_booking_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  creator_limit  numeric;
  approver_limit numeric;
  ag             b2b_agents;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('EXPIRED', 'CANCELLED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'TERMINAL_STATUS: booking % is %', OLD.code, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('EXPIRED', 'CANCELLED') THEN NEW.hold_expires_at := NULL; RETURN NEW; END IF;

  IF NEW.agent_id IS NOT NULL THEN
    SELECT * INTO ag FROM b2b_agents WHERE id = NEW.agent_id;
    IF ag.tier::text <> NEW.channel::text THEN
      RAISE EXCEPTION 'CHANNEL_MISMATCH: agent % is % but booking channel is %', ag.code, ag.tier, NEW.channel USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' AND ag.tier = 'B2B' AND (ag.is_blocked OR ag.overdue_since IS NOT NULL) THEN
      RAISE EXCEPTION 'CREDIT_LOCK: agent % cannot self-book', ag.code USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.sale_mode = 'UNBUNDLED' AND NEW.priced_by IS NULL THEN
    NEW.status := 'PENDING_PRICING';
    NEW.net_egp := NULL;
  ELSIF NEW.discount_pct > 0 THEN
    SELECT d.max_discount_pct INTO creator_limit FROM staff s JOIN discount_authority d USING (role) WHERE s.id = NEW.staff_id;
    IF NEW.approved_by IS NOT NULL THEN
      SELECT d.max_discount_pct INTO approver_limit FROM staff s JOIN discount_authority d USING (role) WHERE s.id = NEW.approved_by;
      IF approver_limit < NEW.discount_pct THEN
        RAISE EXCEPTION 'APPROVER_AUTHORITY: approver limit %%% < requested %%%', approver_limit, NEW.discount_pct USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF COALESCE(creator_limit, 0) < NEW.discount_pct THEN
      NEW.status := 'PENDING_APPROVAL';
    END IF;
  END IF;

  IF NEW.status NOT IN ('PENDING_APPROVAL', 'PENDING_PRICING')
     OR (NEW.status = 'PENDING_APPROVAL' AND NEW.approved_by IS NOT NULL)
     OR (NEW.status = 'PENDING_PRICING' AND NEW.priced_by IS NOT NULL) THEN
    NEW.status := CASE WHEN NEW.paid_egp >= NEW.net_egp THEN 'CONFIRMED'
                       WHEN NEW.paid_egp > 0            THEN 'DEPOSIT'
                       ELSE 'SOFT_HOLD' END;
  END IF;

  IF is_hold_status(NEW.status) THEN
    NEW.hold_expires_at := COALESCE(NEW.hold_expires_at, NEW.created_at + interval '24 hours');
    IF NEW.hold_expires_at < NEW.created_at + interval '2 hours' AND TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'TTL_WINDOW: soft-hold must be between 2 and 24 hours' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NEW.hold_expires_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_booking_governance BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION fn_booking_governance();

CREATE TABLE installments (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label      text NOT NULL,
  due_date   date NOT NULL,
  amount_egp numeric(14,2) NOT NULL CHECK (amount_egp > 0),
  paid_at    timestamptz
);

CREATE TABLE payments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings(id),
  receipt_no  text NOT NULL UNIQUE,
  amount_egp  numeric(14,2) NOT NULL CHECK (amount_egp > 0),
  method      text NOT NULL CHECK (method IN ('CASH', 'BANK_DEPOSIT', 'INSTAPAY', 'WALLET')),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by bigint REFERENCES staff(id)
);
CREATE FUNCTION fn_payment_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bookings SET paid_egp = paid_egp + NEW.amount_egp WHERE id = NEW.booking_id;  -- governance re-derives status
  RETURN NEW;
END $$;
CREATE TRIGGER trg_payment_post AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION fn_payment_post();

CREATE TABLE boarding_points (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label text NOT NULL
);

CREATE TABLE passengers (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id        bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name_ar           text NOT NULL,
  name_en           text NOT NULL CHECK (name_en ~ '^[A-Z][A-Z .''-]+$'),   -- exactly as MRZ / passport
  gender            gender NOT NULL,
  pax_type          pax_type NOT NULL,
  birth_date        date NOT NULL,
  nationality       char(3) NOT NULL DEFAULT 'EGY',
  passport_no       text NOT NULL CHECK (passport_no ~ '^[A-Z0-9]{6,12}$'),
  passport_expiry   date NOT NULL,
  national_id       text CHECK (national_id ~ '^[0-9]{14}$'),
  border_no         text CHECK (border_no ~ '^[0-9]{10}$'),
  phone             text,
  boarding_point_id bigint REFERENCES boarding_points(id),
  UNIQUE (booking_id, passport_no)
);
CREATE INDEX passengers_booking_idx ON passengers (booking_id);

-- Passport validity alert: < 6 months after the trip's return date.
CREATE VIEW v_passport_alerts AS
SELECT p.id AS passenger_id, p.name_en, p.passport_no, p.passport_expiry, t.return_date,
       CASE WHEN p.passport_expiry < t.return_date THEN 'EXPIRED_BEFORE_RETURN'
            WHEN p.passport_expiry < t.return_date + interval '6 months' THEN 'LESS_THAN_6_MONTHS' END AS alert
FROM passengers p JOIN bookings b ON b.id = p.booking_id JOIN trips t ON t.id = b.trip_id
WHERE p.passport_expiry < t.return_date + interval '6 months' AND is_live_status(b.status);

-- ---------------------------------------------------------------------
-- 8. ROOMS & BEDS (Dual visual maps — one room set per city)
-- ---------------------------------------------------------------------
CREATE TABLE rooming_locks (
  trip_id   bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city      city_code NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by bigint REFERENCES staff(id),
  PRIMARY KEY (trip_id, city)
);

-- Rooms absorbed by a trip from an allotment ("Allotment_Rooms").
CREATE TABLE allotment_rooms (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id            bigint NOT NULL,
  city               city_code NOT NULL,
  allotment_id       bigint NOT NULL REFERENCES hotel_allotments(id),
  room_type          room_type NOT NULL,
  virtual_code       text NOT NULL,                           -- e.g. V-MAK-Quad-01
  physical_no        text,                                    -- e.g. 504 (from hotel reception)
  gender_lock        room_gender_lock,                        -- NULL = pool, not opened
  private_booking_id bigint REFERENCES bookings(id),
  FOREIGN KEY (trip_id, city) REFERENCES trip_stays(trip_id, city),
  UNIQUE (trip_id, virtual_code),
  CONSTRAINT private_consistency CHECK ((gender_lock = 'PRIVATE') = (private_booking_id IS NOT NULL))
);
CREATE UNIQUE INDEX allotment_rooms_physical_uq ON allotment_rooms (trip_id, city, physical_no) WHERE physical_no IS NOT NULL;

-- Absorption: each trip room consumes one room/night of the allotment; the inventory CHECK blocks over-absorption.
CREATE FUNCTION fn_absorb_room() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s trip_stays; delta int; r allotment_rooms;
BEGIN
  r := COALESCE(NEW, OLD);
  delta := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
  SELECT * INTO s FROM trip_stays WHERE trip_id = r.trip_id AND city = r.city;
  IF s.allotment_id <> r.allotment_id THEN
    RAISE EXCEPTION 'ALLOTMENT_MISMATCH: room must come from the allotment bound to the % stay', r.city USING ERRCODE = 'check_violation';
  END IF;
  UPDATE allotment_inventory_daily
     SET consumed_company = consumed_company + delta
   WHERE allotment_id = r.allotment_id AND room_type = r.room_type
     AND stay_date >= s.check_in AND stay_date < s.check_in + s.nights;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO hotel_beds (room_id, bed_no, city) SELECT r.id, g, r.city FROM generate_series(1, room_capacity(r.room_type)) g;
  END IF;
  RETURN r;
END $$;

CREATE TABLE hotel_beds (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id      bigint NOT NULL REFERENCES allotment_rooms(id) ON DELETE CASCADE,
  bed_no       smallint NOT NULL CHECK (bed_no BETWEEN 1 AND 5),
  city         city_code NOT NULL,                       -- denormalised for the per-city uniqueness below
  passenger_id bigint REFERENCES passengers(id),
  assigned_at  timestamptz,
  assigned_by  bigint REFERENCES staff(id),
  UNIQUE (room_id, bed_no),
  -- a passenger holds exactly one bed per city (Makkah bed + Madinah bed). Deferrable so swaps work in one TX.
  CONSTRAINT one_bed_per_city UNIQUE (passenger_id, city) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER trg_absorb_room AFTER INSERT OR DELETE ON allotment_rooms FOR EACH ROW EXECUTE FUNCTION fn_absorb_room();

/*
 * THE strict gender-lock guard (mirror of Engine.canPlace):
 *  - only ADULT pax consume a physical bed (CHD/INF ride as badges with their family)
 *  - booking must be live; rooming list for the city must not be locked
 *  - private room → only passengers of the owning booking, gender check intentionally skipped
 *  - shared room  → must be opened (gender_lock set) and equal the passenger gender
 *  - belt & braces: no occupant of the other gender may already be in the room
 * The room row is locked FOR UPDATE, so two concurrent sessions can never
 * seat a man and a woman into the same freshly-opened room.
 */
CREATE FUNCTION fn_guard_bed_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rm allotment_rooms; px passengers; bk bookings;
BEGIN
  IF NEW.passenger_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.passenger_id IS NOT NULL AND EXISTS (SELECT 1 FROM allotment_rooms r JOIN rooming_locks l ON l.trip_id = r.trip_id AND l.city = r.city WHERE r.id = NEW.room_id) THEN
      RAISE EXCEPTION 'ROOMING_LOCKED: final rooming list is locked' USING ERRCODE = 'check_violation';
    END IF;
    NEW.assigned_at := NULL; NEW.assigned_by := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.passenger_id IS NOT DISTINCT FROM OLD.passenger_id THEN RETURN NEW; END IF;

  SELECT * INTO rm FROM allotment_rooms WHERE id = NEW.room_id FOR UPDATE;
  SELECT * INTO px FROM passengers WHERE id = NEW.passenger_id;
  SELECT * INTO bk FROM bookings WHERE id = px.booking_id;

  IF NEW.bed_no > room_capacity(rm.room_type) THEN
    RAISE EXCEPTION 'BED_OUT_OF_RANGE: room % has % beds', rm.virtual_code, room_capacity(rm.room_type) USING ERRCODE = 'check_violation';
  END IF;
  IF px.pax_type <> 'ADULT' THEN
    RAISE EXCEPTION 'NO_BED_PAX: % passengers do not occupy a physical bed', px.pax_type USING ERRCODE = 'check_violation';
  END IF;
  IF NOT is_live_status(bk.status) THEN
    RAISE EXCEPTION 'BOOKING_NOT_LIVE: booking % is %', bk.code, bk.status USING ERRCODE = 'check_violation';
  END IF;
  IF bk.trip_id <> rm.trip_id THEN
    RAISE EXCEPTION 'TRIP_MISMATCH' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM rooming_locks WHERE trip_id = rm.trip_id AND city = rm.city) THEN
    RAISE EXCEPTION 'ROOMING_LOCKED: final rooming list for % is locked', rm.city USING ERRCODE = 'check_violation';
  END IF;

  IF rm.private_booking_id IS NOT NULL THEN
    IF rm.private_booking_id <> px.booking_id THEN
      RAISE EXCEPTION 'PRIVATE_ROOM: room % is closed for another booking', rm.virtual_code USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF bk.sale_mode = 'PRIVATE_ROOM' THEN
      RAISE EXCEPTION 'PRIVATE_BOOKING_IN_SHARED_ROOM: booking % bought a closed room', bk.code USING ERRCODE = 'check_violation';
    END IF;
    IF rm.gender_lock IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_OPENED: open room % and lock its gender first', rm.virtual_code USING ERRCODE = 'check_violation';
    END IF;
    IF rm.gender_lock::text <> px.gender::text THEN
      RAISE EXCEPTION 'GENDER_MIX_FORBIDDEN: room % is locked to %, passenger is %', rm.virtual_code, rm.gender_lock, px.gender USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM hotel_beds b JOIN passengers o ON o.id = b.passenger_id
               WHERE b.room_id = NEW.room_id AND b.id <> NEW.id AND o.gender <> px.gender) THEN
      RAISE EXCEPTION 'GENDER_MIX_FORBIDDEN: room % already hosts the other gender', rm.virtual_code USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.assigned_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_bed_assignment BEFORE INSERT OR UPDATE OF passenger_id ON hotel_beds
  FOR EACH ROW EXECUTE FUNCTION fn_guard_bed_assignment();

-- A room's gender lock cannot be flipped/cleared while occupants would violate it.
CREATE FUNCTION fn_guard_room_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gender_lock IS DISTINCT FROM OLD.gender_lock OR NEW.private_booking_id IS DISTINCT FROM OLD.private_booking_id THEN
    IF NEW.gender_lock IS NULL AND EXISTS (SELECT 1 FROM hotel_beds WHERE room_id = NEW.id AND passenger_id IS NOT NULL) THEN
      RAISE EXCEPTION 'ROOM_OCCUPIED: cannot return an occupied room to the pool' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.gender_lock IN ('M', 'F') AND EXISTS (
         SELECT 1 FROM hotel_beds b JOIN passengers p ON p.id = b.passenger_id
         WHERE b.room_id = NEW.id AND p.gender::text <> NEW.gender_lock::text) THEN
      RAISE EXCEPTION 'GENDER_MIX_FORBIDDEN: occupants conflict with new lock %', NEW.gender_lock USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.gender_lock = 'PRIVATE' AND EXISTS (
         SELECT 1 FROM hotel_beds b JOIN passengers p ON p.id = b.passenger_id
         WHERE b.room_id = NEW.id AND p.booking_id <> NEW.private_booking_id) THEN
      RAISE EXCEPTION 'PRIVATE_ROOM: room already hosts other bookings' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_room_lock BEFORE UPDATE ON allotment_rooms FOR EACH ROW EXECUTE FUNCTION fn_guard_room_lock();

-- Open a pool room as a shared room of a given gender ("+ فتح غرفة تفريد جديدة").
CREATE FUNCTION fn_open_shared_room(p_trip bigint, p_city city_code, p_type room_type, p_gender gender) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE rid bigint;
BEGIN
  SELECT r.id INTO rid FROM allotment_rooms r
   WHERE r.trip_id = p_trip AND r.city = p_city AND r.room_type = p_type AND r.gender_lock IS NULL
     AND NOT EXISTS (SELECT 1 FROM hotel_beds b WHERE b.room_id = r.id AND b.passenger_id IS NOT NULL)
   ORDER BY r.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF rid IS NULL THEN RAISE EXCEPTION 'POOL_EXHAUSTED: no % room left in the % allotment', p_type, p_city; END IF;
  UPDATE allotment_rooms SET gender_lock = p_gender::text::room_gender_lock WHERE id = rid;
  RETURN rid;
END $$;

-- Atomic swap (Click Bed A → Click Bed B → Swap). Every move is re-validated by the guard trigger.
CREATE FUNCTION fn_swap_beds(p_bed_a bigint, p_bed_b bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a hotel_beds; b hotel_beds;
BEGIN
  SELECT * INTO a FROM hotel_beds WHERE id = p_bed_a FOR UPDATE;
  SELECT * INTO b FROM hotel_beds WHERE id = p_bed_b FOR UPDATE;
  IF a.city <> b.city THEN RAISE EXCEPTION 'CROSS_CITY_SWAP'; END IF;
  UPDATE hotel_beds SET passenger_id = NULL WHERE id IN (a.id, b.id);
  UPDATE hotel_beds SET passenger_id = a.passenger_id WHERE id = b.id;
  UPDATE hotel_beds SET passenger_id = b.passenger_id WHERE id = a.id;
END $$;

-- Soft-hold TTL sweeper. Schedule with pg_cron:
--   SELECT cron.schedule('umrah-release-holds', '* * * * *', 'SELECT umrah.fn_release_expired_holds()');
CREATE FUNCTION fn_release_expired_holds(p_now timestamptz DEFAULT now()) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  WITH expired AS (
    UPDATE bookings SET status = 'EXPIRED'
     WHERE status IN ('SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING') AND hold_expires_at <= p_now
    RETURNING id
  ), freed_beds AS (
    UPDATE hotel_beds hb SET passenger_id = NULL
      FROM passengers p WHERE hb.passenger_id = p.id AND p.booking_id IN (SELECT id FROM expired)
    RETURNING hb.id
  ), freed_seats AS (
    UPDATE bus_seats bs SET passenger_id = NULL
      FROM passengers p WHERE bs.passenger_id = p.id AND p.booking_id IN (SELECT id FROM expired)
    RETURNING bs.seat_no
  ), freed_rooms AS (
    UPDATE allotment_rooms SET private_booking_id = NULL, gender_lock = NULL
     WHERE private_booking_id IN (SELECT id FROM expired)
    RETURNING id
  )
  SELECT count(*) INTO n FROM expired;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 9. BUS 49/50 SEATS
-- ---------------------------------------------------------------------
CREATE TABLE bus_trips (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id      bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  plate_no     text NOT NULL,
  driver_name  text,
  driver_phone text,
  capacity     int NOT NULL CHECK (capacity IN (49, 50)),
  layout       jsonb NOT NULL DEFAULT '{"rows":11,"cols":"2+2","rear_bench":5}'
);

CREATE TABLE bus_seats (
  bus_trip_id  bigint NOT NULL REFERENCES bus_trips(id) ON DELETE CASCADE,
  seat_no      int NOT NULL CHECK (seat_no >= 1),
  kind         bus_seat_kind NOT NULL DEFAULT 'PAX',
  passenger_id bigint REFERENCES passengers(id),
  PRIMARY KEY (bus_trip_id, seat_no),
  CONSTRAINT one_seat_per_bus UNIQUE (bus_trip_id, passenger_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (kind = 'PAX' OR passenger_id IS NULL)
);
CREATE FUNCTION fn_guard_bus_seat() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cap int; px passengers; bt bus_trips; bk bookings;
BEGIN
  SELECT * INTO bt FROM bus_trips WHERE id = NEW.bus_trip_id;
  IF NEW.seat_no > bt.capacity THEN RAISE EXCEPTION 'SEAT_OUT_OF_RANGE: bus has % seats', bt.capacity USING ERRCODE = 'check_violation'; END IF;
  IF NEW.passenger_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO px FROM passengers WHERE id = NEW.passenger_id;
  SELECT * INTO bk FROM bookings WHERE id = px.booking_id;
  IF px.pax_type = 'INF' THEN RAISE EXCEPTION 'INFANT_NO_SEAT: infants travel on a guardian lap' USING ERRCODE = 'check_violation'; END IF;
  IF bk.trip_id <> bt.trip_id OR NOT is_live_status(bk.status) THEN RAISE EXCEPTION 'SEAT_PAX_INVALID' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_bus_seat BEFORE INSERT OR UPDATE ON bus_seats FOR EACH ROW EXECUTE FUNCTION fn_guard_bus_seat();

-- ---------------------------------------------------------------------
-- 10. OPERATIONS: PASSPORT VAULT, ITINERARY
-- ---------------------------------------------------------------------
CREATE TABLE passport_vault (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  passenger_id  bigint NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  stage         passport_stage NOT NULL,
  moved_at      timestamptz NOT NULL DEFAULT now(),
  moved_by      bigint REFERENCES staff(id),
  location_note text
);
-- Chain of custody: a passport moves one step at a time (forward or back), never jumps.
CREATE FUNCTION fn_guard_passport_move() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cur passport_stage;
BEGIN
  SELECT stage INTO cur FROM passport_vault WHERE passenger_id = NEW.passenger_id ORDER BY moved_at DESC, id DESC LIMIT 1;
  IF cur IS NULL AND NEW.stage <> 'REP' THEN
    RAISE EXCEPTION 'CUSTODY_CHAIN: first custody stage must be REP' USING ERRCODE = 'check_violation';
  END IF;
  IF cur IS NOT NULL AND abs(array_position(enum_range(NULL::passport_stage), NEW.stage) - array_position(enum_range(NULL::passport_stage), cur)) <> 1 THEN
    RAISE EXCEPTION 'CUSTODY_CHAIN: cannot move passport from % to %', cur, NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_passport_move BEFORE INSERT ON passport_vault FOR EACH ROW EXECUTE FUNCTION fn_guard_passport_move();

CREATE VIEW v_passport_current AS
SELECT DISTINCT ON (passenger_id) passenger_id, stage, moved_at, moved_by
FROM passport_vault ORDER BY passenger_id, moved_at DESC, id DESC;

CREATE TABLE itinerary_items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id       bigint NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_no        int NOT NULL CHECK (day_no >= 1),
  activity_date date NOT NULL,
  city          city_code NOT NULL,
  start_time    time,
  title         text NOT NULL,
  notes         text,
  needs_permit  boolean NOT NULL DEFAULT false    -- e.g. Rawdah via Nusuk
);

-- ---------------------------------------------------------------------
-- 11. FINANCE: SETTLEMENTS (FX), FIELD EXPENSES, AUDIT
-- ---------------------------------------------------------------------
CREATE TABLE supplier_settlements (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id         bigint NOT NULL REFERENCES trips(id),
  supplier_id     bigint NOT NULL REFERENCES suppliers(id),
  reference       text NOT NULL,
  amount_sar      numeric(14,2) NOT NULL CHECK (amount_sar > 0),
  fx_ref_rate     numeric(10,4) NOT NULL CHECK (fx_ref_rate > 0),     -- snapshot of trips.fx_ref_rate
  fx_actual_rate  numeric(10,4) NOT NULL CHECK (fx_actual_rate > 0),
  -- FX Variance = Amount(SAR) × (FX_actual − FX_ref); positive = loss
  fx_variance_egp numeric(16,2) GENERATED ALWAYS AS (round(amount_sar * (fx_actual_rate - fx_ref_rate), 2)) STORED,
  settled_at      date NOT NULL DEFAULT current_date
);
CREATE FUNCTION fn_settlement_fx_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT fx_ref_rate INTO NEW.fx_ref_rate FROM trips WHERE id = NEW.trip_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_settlement_fx_snapshot BEFORE INSERT ON supplier_settlements FOR EACH ROW EXECUTE FUNCTION fn_settlement_fx_snapshot();

CREATE TABLE field_expenses (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id       bigint NOT NULL REFERENCES trips(id),
  supervisor_id bigint REFERENCES supervisors(id),
  label         text NOT NULL,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  currency      currency_code NOT NULL,
  fx_rate       numeric(10,4) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  spent_at      date NOT NULL DEFAULT current_date
);

CREATE TABLE audit_log (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  actor     bigint REFERENCES staff(id),
  entity    text NOT NULL,
  entity_id bigint,
  action    text NOT NULL,
  payload   jsonb
);

-- ---------------------------------------------------------------------
-- 12. REPORTING VIEWS
-- ---------------------------------------------------------------------
-- Official Saudi rooming list (Ministry format). No-bed pax follow the first bedded adult of their booking.
CREATE VIEW v_rooming_list AS
WITH bedded AS (
  SELECT r.trip_id, r.city, COALESCE(r.physical_no, r.virtual_code) AS room_no, r.room_type, p.*, b.bed_no
  FROM hotel_beds b JOIN allotment_rooms r ON r.id = b.room_id JOIN passengers p ON p.id = b.passenger_id
), anchor AS (
  SELECT DISTINCT ON (trip_id, city, booking_id) trip_id, city, booking_id, room_no, room_type
  FROM bedded ORDER BY trip_id, city, booking_id, room_no, bed_no
)
SELECT trip_id, city, room_no, initcap(room_type::text) AS room_type, name_en AS full_name, passport_no, nationality,
       CASE gender WHEN 'M' THEN 'Male' ELSE 'Female' END AS gender, border_no, birth_date, 1 AS sort_group
FROM bedded
UNION ALL
SELECT a.trip_id, a.city, a.room_no, initcap(a.room_type::text) || CASE p.pax_type WHEN 'CHD' THEN ' (+Child No-Bed)' ELSE ' (+Infant)' END,
       p.name_en, p.passport_no, p.nationality, CASE p.gender WHEN 'M' THEN 'Male' ELSE 'Female' END, p.border_no, p.birth_date, 2
FROM anchor a JOIN passengers p ON p.booking_id = a.booking_id AND p.pax_type <> 'ADULT';

CREATE VIEW v_bus_manifest AS
SELECT bt.trip_id, bt.plate_no, s.seat_no, p.name_ar, p.name_en, p.phone, bk.code AS booking_code, bp.label AS boarding_point
FROM bus_seats s JOIN bus_trips bt ON bt.id = s.bus_trip_id JOIN passengers p ON p.id = s.passenger_id
JOIN bookings bk ON bk.id = p.booking_id LEFT JOIN boarding_points bp ON bp.id = p.boarding_point_id;

CREATE VIEW v_allotment_heatmap AS
SELECT i.allotment_id, a.code, h.city, i.stay_date,
       SUM(i.total_rooms) AS total, SUM(i.consumed_company) AS company, SUM(i.sold_agents) AS agents,
       SUM(i.held) AS held, SUM(i.free_sale) AS free_sale, MAX(i.price_multiplier) AS peak_multiplier,
       (a.cutoff_date - current_date) AS days_to_cutoff
FROM allotment_inventory_daily i JOIN hotel_allotments a ON a.id = i.allotment_id JOIN hotels h ON h.id = a.hotel_id
GROUP BY i.allotment_id, a.code, h.city, i.stay_date, a.cutoff_date;

-- Breakage: empty beds in opened shared rooms → published as free-sale beds.
CREATE VIEW v_breakage_beds AS
SELECT r.trip_id, r.city, r.id AS room_id, COALESCE(r.physical_no, r.virtual_code) AS room_no, r.room_type, r.gender_lock,
       count(*) FILTER (WHERE b.passenger_id IS NULL) AS free_beds
FROM allotment_rooms r JOIN hotel_beds b ON b.room_id = r.id
WHERE r.gender_lock IN ('M', 'F')
GROUP BY r.id HAVING count(*) FILTER (WHERE b.passenger_id IS NULL) > 0;

CREATE VIEW v_agent_statement AS
SELECT t.agent_id, t.created_at, t.txn_type, t.memo, t.booking_id,
       CASE WHEN t.amount < 0 THEN -t.amount END AS debit,
       CASE WHEN t.amount > 0 THEN t.amount END AS credit,
       SUM(t.amount) OVER (PARTITION BY t.agent_id ORDER BY t.created_at, t.id) AS running_balance
FROM wallet_transactions t;

-- Trip P&L: operating result at FX_ref, FX impact isolated (settled at actual, open at p_market_rate).
CREATE FUNCTION fn_trip_pnl(p_trip bigint, p_market_rate numeric) RETURNS TABLE (
  revenue_egp numeric, collected_egp numeric, hotels_sar numeric, other_sar numeric, local_egp numeric,
  commissions_egp numeric, field_egp numeric, operating_profit_egp numeric, fx_loss_egp numeric, net_profit_egp numeric, margin_pct numeric
) LANGUAGE sql STABLE AS $$
WITH t AS (SELECT * FROM trips WHERE id = p_trip),
live AS (SELECT * FROM bookings WHERE trip_id = p_trip AND status IN ('DEPOSIT', 'CONFIRMED')),
pax AS (SELECT p.pax_type FROM passengers p JOIN live ON live.id = p.booking_id),
hotel AS (
  SELECT COALESCE(SUM(ar.rate_per_night * s.nights), 0) AS sar
  FROM allotment_rooms r JOIN trip_stays s ON s.trip_id = r.trip_id AND s.city = r.city
  JOIN allotment_rates ar ON ar.allotment_id = r.allotment_id AND ar.room_type = r.room_type
  WHERE r.trip_id = p_trip AND (r.gender_lock IS NOT NULL OR EXISTS (SELECT 1 FROM hotel_beds b WHERE b.room_id = r.id AND b.passenger_id IS NOT NULL))
),
items AS (
  SELECT
    SUM(CASE WHEN i.currency = 'SAR' THEN CASE WHEN i.behavior = 'FIXED' THEN i.qty * i.unit_price
         ELSE i.unit_price * ((SELECT count(*) FROM pax WHERE pax_type = 'ADULT') + (SELECT count(*) FROM pax WHERE pax_type = 'CHD') * i.child_factor + (SELECT count(*) FROM pax WHERE pax_type = 'INF') * i.infant_factor) END ELSE 0 END) AS sar,
    SUM(CASE WHEN i.currency = 'EGP' THEN CASE WHEN i.behavior = 'FIXED' THEN i.qty * i.unit_price
         ELSE i.unit_price * ((SELECT count(*) FROM pax WHERE pax_type = 'ADULT') + (SELECT count(*) FROM pax WHERE pax_type = 'CHD') * i.child_factor + (SELECT count(*) FROM pax WHERE pax_type = 'INF') * i.infant_factor) END ELSE 0 END) AS egp
  FROM trip_cost_items i WHERE i.trip_id = p_trip
),
settle AS (SELECT COALESCE(SUM(amount_sar), 0) AS sar, COALESCE(SUM(amount_sar * fx_actual_rate), 0) AS egp FROM supplier_settlements WHERE trip_id = p_trip),
calc AS (
  SELECT (SELECT COALESCE(SUM(net_egp), 0) FROM live) AS revenue,
         (SELECT COALESCE(SUM(paid_egp), 0) FROM bookings WHERE trip_id = p_trip) AS collected,
         hotel.sar AS hotels_sar, COALESCE(items.sar, 0) AS other_sar, COALESCE(items.egp, 0) AS local_egp,
         (SELECT COALESCE(SUM(agent_commission_egp + CASE WHEN incentive_mode = 'AGENT_CREDIT' THEN incentive_egp ELSE 0 END), 0) FROM live) AS commissions,
         (SELECT COALESCE(SUM(amount * fx_rate), 0) FROM field_expenses WHERE trip_id = p_trip) AS field,
         t.fx_ref_rate, settle.sar AS settled_sar, settle.egp AS settled_egp
  FROM t, hotel, items, settle
)
SELECT revenue, collected, hotels_sar, other_sar, local_egp, commissions, field,
       revenue - (hotels_sar + other_sar) * fx_ref_rate - local_egp - commissions - field AS operating,
       settled_egp + GREATEST(hotels_sar + other_sar - settled_sar, 0) * p_market_rate - (hotels_sar + other_sar) * fx_ref_rate AS fx_loss,
       revenue - (hotels_sar + other_sar) * fx_ref_rate - local_egp - commissions - field
         - (settled_egp + GREATEST(hotels_sar + other_sar - settled_sar, 0) * p_market_rate - (hotels_sar + other_sar) * fx_ref_rate) AS net,
       CASE WHEN revenue > 0 THEN round(100 * (revenue - (hotels_sar + other_sar) * fx_ref_rate - local_egp - commissions - field
         - (settled_egp + GREATEST(hotels_sar + other_sar - settled_sar, 0) * p_market_rate - (hotels_sar + other_sar) * fx_ref_rate)) / revenue, 2) END
FROM calc
$$;

COMMIT;
